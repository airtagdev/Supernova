export const smwGameArchives = Object.freeze({
  'awesome-mario-world': 'https://files.smwgames.com/BaUZr1d1rV9wG2iFqWG3qKOMIcGmJVmMrceSKMQpFLaTqLaVpL9RGUezpMBoFKaRr0m5C0ihB1doBz9LCIY4q1eZp1OgLazmLMCKpUXnso0%3D/8873.7z',
  'mega-mario-world': 'https://files.smwgames.com/BaUZr2Ulqb9pK2sJqWO3pbUMKVscrKzoK3U1KbU0qWQMO05kpoCmr1aRpJeoqKUkBMG3pTCNIaNoG09LCIY4q1eZp1OgLazmLMYEpKYnso0%3D/7950.7z',
  'super-mario-legacy': 'https://files.smwgames.com/BaUBr1eZJb5pqMCJqWO4pJNmtbeGIWYpIV0ls0YVp0GEJoQSrLULp0iTH3KNHKr5GWN1OaUppMzoG09LCIY4q1eZp1OgLazmLMC3I1X4II0%3D/12972.7z',
  'superstar-mario-world': 'https://files.smwgames.com/BaUZr2URKbapqMKxGL1XOLh2FzsdORiDqIabs2NgtSwgJJOSBUKVF3UXG3OCFJ1kDViXCMTkHcOaOWKILz85r1aZqKeULaehLLeYILYgN2r%3D/14331.7z',
  'total-mario-world': 'https://files.smwgames.com/BaUZr1epqV9OqIGHqWUGFcYFBLwQBzwNDWYRLbUksoanNMGdp0woH2sRGWGCrMwfp0ipDUUcC3NoBz9LCIY4q1eZp1OgLazmLMG2LUCUOo0%3D/14421.7z'
});

export function getSmwGameArchive(slug) {
  return Object.hasOwn(smwGameArchives, slug) ? smwGameArchives[slug] : null;
}
