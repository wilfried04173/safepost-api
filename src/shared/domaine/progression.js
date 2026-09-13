/**
 * Calcul de la progression d'une livraison — copie côté API (source de vérité).
 *
 * ⚠️ Ce fichier existe en double : la copie navigateur vit dans
 * `client/src/shared/domaine/progression.js`. Ce n'est pas un oubli de
 * factorisation : client et serveur sont deux applications déployées
 * séparément (Railway), chacune dans son propre répertoire racine. Un import
 * du type `../../../shared/...` qui sort de ce répertoire n'existe tout
 * simplement pas une fois le projet déployé — la plateforme n'envoie que le
 * contenu du dossier configuré comme racine. Dupliquer ce module pur (aucune
 * dépendance, aucun accès réseau) est plus fiable qu'un partage inter-dossiers
 * qui casse au déploiement.
 *
 * Toute modification de la logique doit être répercutée dans les deux copies.
 *
 * C'est cette copie qui fait autorité : l'API l'exécute au moment de la
 * requête pour servir une valeur juste, et le navigateur ne fait que la
 * rejouer ensuite pour animer la barre entre deux requêtes.
 *
 * Principe : le serveur ne stocke QUE des horodatages. Il n'y a ni tâche de
 * fond, ni cron, ni job planifié à maintenir en vie. Une progression stockée
 * demanderait un processus qui la met à jour en continu ; s'il tombe, la barre
 * gèle sans que personne ne s'en aperçoive. Ici il n'y a rien qui puisse tomber,
 * et une pause reste exacte même si personne n'ouvre la page pendant trois jours.
 */

/**
 * Tant que l'agence n'a pas consigné la livraison, la barre ne dépasse pas 90 %.
 * Afficher 100 % sur un colis non livré est mensonger et génère exactement les
 * appels que la page de suivi est censée éviter.
 */
export const PLAFOND_AVANT_LIVRAISON = 0.9;

/**
 * Découpage du trajet. Les seuils sont le ratio à partir duquel l'étape s'allume.
 *
 * Le dernier kilomètre est court par nature — le colis est déjà dans le véhicule
 * du livreur. Lui donner une part plus large afficherait « en cours de livraison »
 * pendant des jours.
 *
 *   0 %  ─────────► 15 %  ─────────────────────────► 85 %  ─────────► 100 %
 *   enregistrée      en transit (70 % du trajet)      en cours de livraison
 */
export const SEUILS = {
  registered: 0,
  in_transit: 0.15,
  out_for_delivery: 0.85,
};

/** Les quatre étapes affichées, dans l'ordre. */
export const ETAPES = ['registered', 'in_transit', 'out_for_delivery', 'delivered'];

const toMs = (value) => (value ? new Date(value).getTime() : null);

/**
 * Durée effectivement écoulée, pauses déduites.
 *
 * Quand la livraison est en pause, l'horloge s'arrête à l'instant de la mise en
 * pause : la progression gèle au lieu de continuer à avancer dans le vide.
 */
function ecoulerMs({ demarreLe, enPause, pauseeLe, cumulPauseMs = 0 }, maintenant) {
  const depart = toMs(demarreLe);
  if (depart === null) return 0;

  const borne = enPause && pauseeLe ? toMs(pauseeLe) : maintenant;
  return Math.max(0, borne - depart - cumulPauseMs);
}

/**
 * Calcule l'état d'avancement d'une expédition à un instant donné.
 *
 * @param {object} progression      { demarreLe, arriveePrevueLe, enPause, pauseeLe, cumulPauseMs }
 * @param {object} etatAgence       { livreLe, annuleLe } — ce que l'agence a consigné à la main
 * @param {number} [maintenant]     horodatage de référence (injectable pour les tests)
 * @returns {{ ratio: number, pourcentage: number, etape: string, enPause: boolean, indexEtape: number }}
 */
export function calculerProgression(progression = {}, etatAgence = {}, maintenant = Date.now()) {
  const { livreLe, annuleLe } = etatAgence;

  // Une livraison se constate, elle ne se chronomètre pas : « livrée » n'est
  // jamais déduite du temps, seule l'agence peut allumer cette étape.
  if (livreLe) {
    return { ratio: 1, pourcentage: 100, etape: 'delivered', enPause: false, indexEtape: 3 };
  }

  if (annuleLe) {
    return { ratio: 0, pourcentage: 0, etape: 'cancelled', enPause: false, indexEtape: -1 };
  }

  const depart = toMs(progression.demarreLe);
  const arrivee = toMs(progression.arriveePrevueLe);
  const enPause = Boolean(progression.enPause);

  // Sans dates exploitables, l'expédition est simplement enregistrée.
  if (depart === null || arrivee === null || arrivee <= depart) {
    return {
      ratio: 0,
      pourcentage: 0,
      etape: enPause ? 'on_hold' : 'registered',
      enPause,
      indexEtape: 0,
    };
  }

  const duree = arrivee - depart;
  const brut = ecoulerMs(progression, maintenant) / duree;

  // Bornage : jamais négatif, jamais au-delà du plafond avant livraison.
  const ratio = Math.min(Math.max(brut, 0), PLAFOND_AVANT_LIVRAISON);

  let etape = 'registered';
  if (ratio >= SEUILS.out_for_delivery) etape = 'out_for_delivery';
  else if (ratio >= SEUILS.in_transit) etape = 'in_transit';

  return {
    ratio,
    pourcentage: Math.round(ratio * 100),
    // Une pause est un état affiché, mais elle ne rembobine pas l'étape atteinte.
    etape: enPause ? 'on_hold' : etape,
    enPause,
    indexEtape: ETAPES.indexOf(etape),
  };
}

/**
 * Date à laquelle une étape a été (ou sera) atteinte, pour horodater la timeline.
 * Renvoie null si les dates de l'expédition ne permettent pas de la calculer.
 */
export function dateDeLEtape(progression = {}, etape) {
  const depart = toMs(progression.demarreLe);
  const arrivee = toMs(progression.arriveePrevueLe);
  if (depart === null || arrivee === null || arrivee <= depart) return null;

  const seuil = SEUILS[etape];
  if (seuil === undefined) return null;

  const duree = arrivee - depart;
  return new Date(depart + duree * seuil + (progression.cumulPauseMs || 0));
}
