export const X_SELECTORS = {
  // One rendered post or reply.
  tweet: 'article[data-testid="tweet"]',
  // The visible post body. Quoted posts can contain another matching node.
  tweetText: '[data-testid="tweetText"]',
  // The rendered display name, handle, badges, and nearby author labels.
  author: '[data-testid="User-Name"]',
  // The profile-picture container used by the read-only indicator.
  avatar: '[data-testid="Tweet-User-Avatar"]',
  // The avatar container X uses in profile headers and hover cards.
  profileAvatar: '[data-testid^="UserAvatar-Container-"]',
  // The user summary card X renders after hovering a profile link or picture.
  hoverCard: '[data-testid="HoverCard"]',
  // The container X currently uses around quoted post content.
  quote: '[data-testid="quoteTweet"]',
  // X's visible verification badge.
  verifiedIcon: '[data-testid="icon-verified"]',
  // Timeline placement wrapper used for promoted content.
  promotedContainer: '[data-testid="placementTracking"]',
  // Common rendered media containers inside posts.
  media: '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]',
  // Visible reply context rendered inside replies.
  replyContext: '[data-testid="reply"], [data-testid="replyContext"]',
} as const;
