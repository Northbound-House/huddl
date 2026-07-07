import { base44 } from '@/api/base44Client';
import { aggregateBoardParticipants, enrichContributorsWithPublicPhotos } from '@/lib/boardContributors';
import { collectAuthorEmailsFromCards } from '@/lib/voterEmails';
import { computeBoardLastActivityIso } from '@/lib/boardActivity';

/**
 * Shared work for Home / Circle pages: contributors for board cards + last-activity timestamps.
 */
export async function buildContributorsAndLastActivity(visibleBoards, sessionUser) {
  const boardCards = await Promise.all(
    visibleBoards.map((b) => base44.entities.Card.listAllForBoard(b.id))
  );
  const emailSet = new Set();
  boardCards.forEach((cards) => {
    for (const em of collectAuthorEmailsFromCards(cards)) emailSet.add(em);
  });
  const photos = await base44.entities.PublicProfile.getByEmails([...emailSet]);
  const contributorsByBoard = {};
  const lastActivityByBoard = {};
  visibleBoards.forEach((b, i) => {
    const cards = boardCards[i];
    contributorsByBoard[b.id] = enrichContributorsWithPublicPhotos(
      aggregateBoardParticipants(cards),
      sessionUser,
      photos
    );
    lastActivityByBoard[b.id] = computeBoardLastActivityIso(b, cards);
  });
  return { contributorsByBoard, lastActivityByBoard };
}
