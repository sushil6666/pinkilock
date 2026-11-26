/**
 * The honest review ask (D110). The store's own in-app review prompt (Google Play's In-App Review
 * API; on iOS, SKStoreReviewController), shown straight after a happy moment: a kept plan, a match
 * (both want round two), or a good call with a listener. There is no question first ("Do you like
 * Pinkilock?") that sends only the happy ones to the store, nothing is given for a review, and a
 * review is never a step for anything (so it is not part of a finished profile or the free call).
 *
 * At most once in REVIEW_GAP_DAYS on this phone; the store also limits how often it really shows.
 * The website has no store prompt, so it does nothing there. The "Rate us" row on Me opens the
 * store page for anyone who wants to, whenever they like.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import { mayAsk, type ReviewMoment } from '../domain/review';
import { quiet } from './log';

export type { ReviewMoment };
const KEY = 'pinkilock.review.asked';

/** After a happy moment. Never awaited by a screen, never throws. */
export async function askForReview(moment: ReviewMoment): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const last = Number(await AsyncStorage.getItem(KEY)) || null;
    if (!mayAsk(last, Date.now())) return;
    if (!(await StoreReview.hasAction())) return;
    await AsyncStorage.setItem(KEY, String(Date.now()));
    await StoreReview.requestReview();
    // Which moment it was stays on the phone: nothing about it goes to a log or the server.
    void moment;
  } catch (e) {
    quiet('review.ask')(e);
  }
}

/** The "Rate us" row: the store page, by the person's choice. */
export async function openStorePage(): Promise<void> {
  try {
    const url = StoreReview.storeUrl();
    if (url) {
      const { Linking } = await import('react-native');
      await Linking.openURL(url);
    }
  } catch (e) {
    quiet('review.store')(e);
  }
}
