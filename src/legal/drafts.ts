/**
 * DRAFTS of the terms and the privacy policy, for a lawyer to review (docs/build-plan.md, WP8). They
 * describe what the app actually does, so that the reviewed versions start from the truth. The
 * version a person agrees to is private.config `legal_version` on the server; change both together.
 */
export const LEGAL_VERSION = '2026-11-17';

export const TERMS = `DRAFT, NOT YET REVIEWED BY A LAWYER

Pinkilock is for adults: you must be 18 or older.

What you promise. When you lock a plan, you promise to show up, or to say so early. Bailing and not showing up go on your record, which other people can see as your Trust Score.

What you must not do: share a way to contact you before a promise is kept (in your name, your line, a photo or a code); harass, threaten or pressure anyone; use Pinkilock for money, sales or recruiting; pretend to be someone else; or use it if you are under 18.

What we can do. We can remove a line, pause or close an account that breaks these terms. Every decision is recorded with its reason, you can see it in the app, and you can appeal it.

Your safety. Meet somewhere public, tell a friend where you will be, and leave whenever you want. If you are in danger, call the emergency number shown on the safety page.

Leaving. You can download your data and delete your account at any time from Me.`;

export const PRIVACY = `DRAFT, NOT YET REVIEWED BY A LAWYER

What we keep: your profile (first name, age, area, city, the line about you, tags and date ideas), the contact you choose to unlock after a kept promise, the photos you add (your face, taken in the app and shown on your card once a person here has checked it, and up to three more shown only after a kept promise; place, phone and time details are stripped from each file), your plans and what happened to them, your answers after a date, and the error codes the app sends when something breaks. Your email or phone number, if you add one, is used to sign you in.

Your location. If you let it, the app reads your device's location once, to suggest your city and nearest area. That happens on your device: the location is never saved, never sent to us and never shown to anyone. Only the city and area you then pick are kept, as part of your profile. You can say no and pick them by hand.

Sensitive information. Who you want to date can say something about your sexual orientation. We use your dating preferences only to run Pinkilock, and only with your explicit agreement, which you can withdraw by deleting your account.

Who sees what. Other people see your card. Your contact is shown only to someone you kept a promise with. Your answers after a date are never shown to anyone. Reports are seen only by moderators.

Automated decisions. Your Trust Score is worked out from your own kept and broken promises. If you think it is wrong, ask us from Me and a person will look at it. New profile lines may be checked by an AI model before others see them; only the line is sent, and anything unclear goes to a person.

Who helps us run it: Supabase (database and sign-in), Expo, Apple and Google (notifications and the app), our email and SMS senders (codes), GitHub (running our checks), and, if switched on, Anthropic (checking profile lines). See the data map for what each receives.

How long we keep it: finished plans lose their place and line after 90 days; notifications go after 30 days; error reports after 30 days; an account that was never finished after 30 days. Deleting your account removes it at once.

Your rights: see, download, correct and delete your data; object to your Trust Score; appeal a moderation decision; withdraw consent. Ask from Me; we answer within 30 days.`;
