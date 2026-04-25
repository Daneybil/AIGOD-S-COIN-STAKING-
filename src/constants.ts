export const CONTRACT_ABI = [
  "function stakingToken() view returns (address)",
  "function MIN_LOCK() view returns (uint256)",
  "function MAX_LOCK() view returns (uint256)",
  "function INTERVAL() view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function totalEffectiveStaked() view returns (uint256)",
  "function totalStakedEver() view returns (uint256)",
  "function totalWithdrawn() view returns (uint256)",
  "function totalRewardsReceived() view returns (uint256)",
  "function totalRewardsDistributed() view returns (uint256)",
  "function lastEpochEndTime() view returns (uint256)",
  "function pendingRewardBNB() view returns (uint256)",
  "function getGlobalStats() view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256)",
  "function stakes(address) view returns (uint256 amount, uint256 startTime, uint256 lockDuration, uint256 rewardDebt, uint256 pendingRewards, uint256 multiplier)",
  "function earned(address) view returns (uint256)",
  "function stake(uint256 amount, uint256 duration) external",
  "function withdraw() external",
  "function claim() external",
  "function getMultiplier(uint256 duration) pure returns (uint256)"
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];
