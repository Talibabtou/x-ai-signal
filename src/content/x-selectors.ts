export const X_SELECTORS = {
  // One rendered post or reply.
  tweet: 'article[data-testid="tweet"]',
  // The visible post body. Quoted posts can contain another matching node.
  tweetText: '[data-testid="tweetText"]',
  // The rendered display name, handle, badges, and nearby author labels.
  author: '[data-testid="User-Name"]',
  // The profile-picture container used by the read-only indicator.
  avatar: '[data-testid="Tweet-User-Avatar"]',
  // The container X currently uses around quoted post content.
  quote: '[data-testid="quoteTweet"]',
  // X's visible verification badge.
  verifiedIcon: '[data-testid="icon-verified"]',
  // Timeline placement wrapper used for promoted content.
  promotedContainer: '[data-testid="placementTracking"]',
} as const;
