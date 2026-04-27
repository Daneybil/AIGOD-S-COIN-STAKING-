/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  TrendingUp, 
  ShieldCheck, 
  Clock, 
  ChevronRight, 
  Info, 
  ExternalLink,
  Coins,
  Gem,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Menu,
  X
} from 'lucide-react';
import { ethers, BrowserProvider, Contract, parseUnits, formatEther } from 'ethers';
import { cn, formatBNB, formatToken } from './lib/utils';
import { CONTRACT_ABI, ERC20_ABI } from './constants';

// --- CONFIG ---
const STAKING_CONTRACT_ADDRESS = "0xD70F4689A352E141a091eAC9E44C97bE59ECFE29";
const TOKEN_ADDRESS = "0xAa3272736aA631dBa7f7b03a3e96289428EBD87C";
const RPC_URL = "https://bsc-dataseed.binance.org/"; // BSC Mainnet

// --- TYPES ---
interface GlobalStats {
  totalStaked: bigint;
  totalEffectiveStaked: bigint;
  totalStakedEver: bigint;
  totalWithdrawn: bigint;
  totalRewardsReceived: bigint;
  totalRewardsDistributed: bigint;
  currentPool: bigint;
}

interface UserStake {
  amount: bigint;
  startTime: bigint;
  lockDuration: bigint;
  rewardDebt: bigint;
  pendingRewards: bigint;
  multiplier: bigint;
  earned: bigint;
}

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [userStake, setUserStake] = useState<UserStake | null>(null);
  const [userBalance, setUserBalance] = useState<bigint>(0n);
  const [userBNBBalance, setUserBNBBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeDuration, setStakeDuration] = useState(40);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // --- CONNECT WALLET ---
  const switchNetwork = async () => {
    if (!(window as any).ethereum) return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x38' }], // BSC Mainnet
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x38',
                chainName: 'Binance Smart Chain',
                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                rpcUrls: ["https://bsc-dataseed.binance.org/"],
                blockExplorerUrls: ['https://bscscan.com/'],
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add BSC network", addError);
        }
      }
    }
  };

  const connectWallet = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("No crypto wallet found. Please install Trust Wallet or MetaMask.");
      return;
    }

    try {
      // Standard request accounts
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        const _provider = new BrowserProvider(eth);
        setAccount(accounts[0]);
        setProvider(_provider);

        // Attempt background switch, but don't let it block connection
        switchNetwork().catch((e) => console.log("Init network switch suppressed:", e.message));

        // Listeners for persistence
        if (eth.on) {
          eth.on('accountsChanged', (newAccounts: string[]) => {
            if (newAccounts.length > 0) setAccount(newAccounts[0]);
            else setAccount(null);
          });
          eth.on('chainChanged', () => window.location.reload());
        }
      }
    } catch (error: any) {
      console.error("Wallet connection failed", error);
      if (error.code === 4001) {
        alert("Wallet connection rejected by user.");
      } else {
        alert("Failed to connect wallet. Please ensure it is unlocked and try again.");
      }
    }
  };

  // --- FETCH DATA ---
  const fetchData = useCallback(async () => {
    try {
      // Use public RPC for reading to avoid wallet dependency
      const readProvider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new Contract(STAKING_CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
      
      // Get Global Stats
      const globalStats = await contract.getGlobalStats();
      setStats({
        totalStaked: globalStats[0],
        totalEffectiveStaked: globalStats[1],
        totalStakedEver: globalStats[2],
        totalWithdrawn: globalStats[3],
        totalRewardsReceived: globalStats[4],
        totalRewardsDistributed: globalStats[5],
        currentPool: globalStats[6],
      });

      // Get User Stats if connected
      if (account) {
        const tokenContract = new Contract(TOKEN_ADDRESS, ERC20_ABI, readProvider);
        const [balance, bnbBalance, stakeDetails, earnedAmount] = await Promise.all([
          tokenContract.balanceOf(account),
          readProvider.getBalance(account),
          contract.stakes(account),
          contract.earned(account)
        ]);

        setUserBalance(balance);
        setUserBNBBalance(bnbBalance);
        setUserStake({
          amount: stakeDetails.amount,
          startTime: stakeDetails.startTime,
          lockDuration: stakeDetails.lockDuration,
          rewardDebt: stakeDetails.rewardDebt,
          pendingRewards: stakeDetails.pendingRewards,
          multiplier: stakeDetails.multiplier,
          earned: earnedAmount,
        });
      }
    } catch (error) {
      console.error("Fetch data failed", error);
    }
  }, [account]);

  useEffect(() => {
    // Auto-connect if already authorized
    const checkConnection = async () => {
      if ((window as any).ethereum) {
        try {
          const _provider = new BrowserProvider((window as any).ethereum);
          const accounts = await _provider.send("eth_accounts", []);
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            setProvider(_provider);
            switchNetwork().catch(console.error);
          }
        } catch (error) {
          console.error("Auto-connect failed", error);
        }
      }
    };
    checkConnection();

    fetchData();
    const interval = setInterval(fetchData, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- ACTIONS ---
  const handleStake = async () => {
    if (!account || !stakeAmount) {
      alert("Connect wallet and enter amount first.");
      return;
    }
    
    setLoading(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("Wallet provider not found.");
      
      const _tempProvider = new BrowserProvider(eth);
      const network = await _tempProvider.getNetwork();
      
      // Ensure we are on BSC (Chain ID 56)
      if (network.chainId !== 56n) {
        try {
          await switchNetwork();
          // Give it a moment to update
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          throw new Error("Please switch to Binance Smart Chain Mainnet to stake.");
        }
      }

      const signer = await _tempProvider.getSigner();
      if (!signer) throw new Error("Signer not available. Please unlock your wallet.");

      const tokenContract = new Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const amount = parseUnits(stakeAmount, 18);
      const durationSeconds = BigInt(stakeDuration) * 24n * 3600n;

      // Verify basic data to prevent silent fails
      const userBal = await tokenContract.balanceOf(account);
      if (userBal < amount) throw new Error("Insufficient AIGODS balance in wallet.");

      // Approval logic
      const allowance = await tokenContract.allowance(account, STAKING_CONTRACT_ADDRESS);
      if (allowance < amount) {
        console.log("Requesting approval...");
        const txApprove = await tokenContract.approve(STAKING_CONTRACT_ADDRESS, ethers.MaxUint256);
        await txApprove.wait();
        console.log("Approval confirmed.");
      }

      // Staking logic
      console.log("Sending stake transaction...");
      const txStake = await stakingContract.stake(amount, durationSeconds);
      console.log("Stake TX Hash:", txStake.hash);
      await txStake.wait();
      
      alert("Successfully staked your AIGODS!");
      setStakeAmount('');
      fetchData();
    } catch (error: any) {
      console.error("Stake logic error:", error);
      const errMsg = error?.reason || error?.message || "Staking transaction failed.";
      alert("Transaction Failed: " + errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!account || !provider) return;
    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await stakingContract.claim();
      await tx.wait();
      fetchData();
    } catch (error) {
      console.error("Claim failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!account || !provider) return;
    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await stakingContract.withdraw();
      await tx.wait();
      fetchData();
    } catch (error) {
      console.error("Withdraw failed", error);
    } finally {
      setLoading(false);
    }
  };

  const multipliers = [
    { days: 40, mul: '1.0x' },
    { days: 80, mul: '1.3x' },
    { days: 120, mul: '1.6x' },
    { days: 160, mul: '2.0x' },
    { days: 200, mul: '2.5x' },
    { days: 240, mul: '3.0x' },
    { days: 280, mul: '3.5x' },
    { days: 320, mul: '4.0x' },
    { days: 340, mul: '4.5x' },
  ];

  return (
    <div className="min-h-screen flex flex-col selection:bg-gold/30 selection:text-gold">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center">
              <TrendingUp className="text-dark-bg w-6 h-6" />
            </div>
            <span className="text-2xl font-display font-bold tracking-tight">
              AIGODS<span className="text-gold">COIN</span>
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-sm font-medium hover:text-gold transition-colors">How it Works</a>
            <a href="#stats" className="text-sm font-medium hover:text-gold transition-colors">Stats</a>
            <a href="#staking" className="text-sm font-medium hover:text-gold transition-colors">Stake Now</a>
            <button 
              onClick={connectWallet}
              className="px-6 py-2.5 bg-gold hover:bg-gold-hover text-dark-bg font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95"
            >
              <Wallet size={18} />
              {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
            </button>
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden glass-card overflow-hidden"
            >
              <div className="p-4 flex flex-col gap-4">
                <a href="#how" className="py-2" onClick={() => setIsMenuOpen(false)}>How it Works</a>
                <a href="#stats" className="py-2" onClick={() => setIsMenuOpen(false)}>Stats</a>
                <a href="#staking" className="py-2" onClick={() => setIsMenuOpen(false)}>Stake Now</a>
                <button 
                  onClick={() => { connectWallet(); setIsMenuOpen(false); }}
                  className="w-full px-6 py-3 bg-gold text-dark-bg font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <Wallet size={18} />
                  {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="absolute top-1/4 -right-20 w-96 h-96 bg-gold/10 blur-[120px] rounded-full" />
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
                Earn Real <span className="gradient-text">BNB Rewards</span> with Smart Staking
              </h1>
              <p className="text-xl text-gray-400 mb-8 leading-relaxed max-w-2xl">
                Stake your AIGODS tokens into our time-weighted protocol. 
                Lock longer to unlock massive multipliers and earn real-yield BNB powered by every trade.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a 
                  href="#staking"
                  className="px-10 py-5 bg-gold hover:bg-gold-hover text-dark-bg font-black rounded-2xl flex items-center justify-center gap-2 text-lg shadow-[0_10px_30px_rgba(255,215,0,0.2)] transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  Start Staking <ChevronRight />
                </a>
                <a 
                  href="#how"
                  className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg border border-white/10 transition-all"
                >
                  View Dashboard
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="py-24 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-16">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-12 text-left">
            {[
              { icon: <Wallet className="text-gold" />, title: "Stake Tokens", desc: "Connect your wallet and deposit your AIGODS tokens into the vault." },
              { icon: <Clock className="text-gold" />, title: "Choose Lock", desc: "Select a lock duration from 40 to 340 days to multiply your shares." },
              { icon: <TrendingUp className="text-gold" />, title: "Earn Multiplier", desc: "The longer you lock, the higher your stake power (up to 4.5x multiplier)." },
              { icon: <Gem className="text-gold" />, title: "Receive BNB", desc: "Collect real BNB rewards every epoch based on your effective share." }
            ].map((step, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="mb-6 w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
                  {step.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section id="stats" className="py-24 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard label="Total Staked" value={stats ? formatToken(stats.totalStaked) : "0"} unit="AIGODS" icon={<Coins />} />
            <StatCard label="Effective Staked" value={stats ? formatToken(stats.totalEffectiveStaked) : "0"} unit="SHARE" icon={<BarChart3 />} />
            <StatCard label="Reward Pool" value={stats ? formatBNB(stats.currentPool) : "0"} unit="BNB" icon={<Gem />} />
            <StatCard label="Distributed" value={stats ? formatBNB(stats.totalRewardsDistributed) : "0"} unit="BNB" icon={<CheckCircle2 />} />
          </div>
        </div>
      </section>

      {/* Multiplier Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="glass-card rounded-[32px] p-8 md:p-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Staking Multipliers</h2>
                <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                  Our system rewards commitment. The longer you commit to the vault, the more "Effective Weight" your stake carries. Higher weight gives you a larger piece of the BNB reward pool every epoch.
                </p>
                <div className="p-6 bg-gold/5 border border-gold/20 rounded-2xl">
                  <div className="flex items-start gap-3">
                    <Info className="text-gold shrink-0 mt-1" />
                    <p className="text-sm text-gold/80 leading-relaxed">
                      "Longer lock = higher earning power. Even with a smaller stake, you can out-earn larger holders by locking for a higher multiplier."
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                {multipliers.map((m, i) => (
                  <div key={i} className="aspect-square glass-card rounded-2xl flex flex-col items-center justify-center border border-white/5 hover:border-gold/30 transition-colors">
                    <span className="text-xs text-gray-500 uppercase font-bold">{m.days} Days</span>
                    <span className="text-xl md:text-2xl font-display font-bold text-gold">{m.mul}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Staking Dashboard */}
      <section id="staking" className="py-24 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Staking Dashboard</h2>
            <p className="text-gray-400">Manage your positions and claim your rewards.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Action Card */}
            <div className="lg:col-span-2 glass-card rounded-3xl p-8">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                  <TrendingUp className="text-gold" /> Create New Stake
                </h3>
              </div>

              <div className="space-y-8">
                <div>
                  <div className="flex justify-between mb-3">
                    <label className="text-sm font-bold text-gray-400 block">Amount to Stake</label>
                    <div className="text-right">
                      <p className="text-xs font-bold text-gold">AIGODS: {formatToken(userBalance)}</p>
                      <p className="text-[10px] text-gray-500 font-bold">BNB: {formatBNB(userBNBBalance)}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      placeholder="0.0"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none focus:border-gold transition-colors"
                    />
                    <button 
                      onClick={() => setStakeAmount(formatEther(userBalance))}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gold font-bold hover:text-white transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-400 mb-3 block">Lock Duration (Days)</label>
                  <div className="flex flex-wrap gap-2 md:gap-3">
                    {[40, 80, 120, 160, 200, 240, 280, 320, 340].map((d) => (
                      <button
                        key={d}
                        onClick={() => setStakeDuration(d)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                          stakeDuration === d 
                            ? "bg-gold text-dark-bg border-gold" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:border-gold/50"
                        )}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-white/[0.03] rounded-2xl border border-white/5">
                  <div className="flex justify-between mb-4">
                    <span className="text-gray-400">Selected Multiplier</span>
                    <span className="font-bold text-gold">{multipliers.find(m => m.days === stakeDuration)?.mul}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Effective Weight</span>
                      <div className="group relative">
                        <Info size={12} className="text-gray-500 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-dark-bg border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[10px] text-gray-300 z-50">
                          <strong>Weight Calculation:</strong><br />
                          Stake Amount × Multiplier.<br />
                          e.g. 7,000 × 2.5x = 17,500 Shares.<br />
                          This is your share of the reward pool.
                        </div>
                      </div>
                    </div>
                    <span className="font-bold text-white">
                      {stakeAmount ? formatToken(Number(stakeAmount) * Number(multipliers.find(m => m.days === stakeDuration)?.mul.replace('x', ''))) : "0"} SHARES
                    </span>
                  </div>
                </div>

                <button 
                  disabled={loading || !account || !stakeAmount}
                  onClick={handleStake}
                  className="w-full py-5 bg-gold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gold-hover text-dark-bg font-black rounded-2xl text-xl shadow-[0_10px_20px_rgba(255,215,0,0.1)] transition-all"
                >
                  {loading ? "Processing..." : "Stake Tokens Now"}
                </button>
              </div>
            </div>

            {/* User Info Card */}
            <div className="glass-card rounded-3xl p-8 flex flex-col">
              <div className="mb-10 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <Wallet className="text-gold" />
                </div>
                <h3 className="text-xl font-bold mb-1">Your Portfolio</h3>
                <p className="text-gray-500 font-mono text-sm">{account ? `${account.slice(0, 10)}...${account.slice(-8)}` : "Wallet Not Connected"}</p>
              </div>

              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Earned Rewards</p>
                    <p className="text-3xl font-display font-bold text-white">{userStake ? formatBNB(userStake.earned) : "0.0000"}</p>
                  </div>
                  <span className="text-gold font-bold">BNB</span>
                </div>

                <button 
                  disabled={loading || !userStake || userStake.earned === 0n}
                  onClick={handleClaim}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Gem size={18} /> Claim Rewards
                </button>

                <div className="p-5 bg-white/[0.02] rounded-2xl space-y-4 border border-white/5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Staked Balance</span>
                    <span className="font-bold">{userStake ? formatToken(userStake.amount) : "0"} AIGODS</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Multiplier</span>
                    <span className="font-bold text-gold">{userStake && userStake.multiplier > 0n ? `${Number(userStake.multiplier) / 1e18}x` : "0.0x"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Lock Ends</span>
                    <span className="font-bold">{userStake && userStake.startTime > 0n ? new Date(Number(userStake.startTime + userStake.lockDuration) * 1000).toLocaleDateString() : "-"}</span>
                  </div>
                </div>

                <button 
                  disabled={loading || !userStake || userStake.amount === 0n}
                  onClick={handleWithdraw}
                  className="w-full py-4 bg-transparent hover:bg-red-500/10 text-gray-500 hover:text-red-500 font-bold rounded-xl border border-white/5 transition-all"
                >
                  Withdraw All
                </button>
              </div>

              {!account && (
                <div className="absolute inset-0 bg-dark-bg/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-8 text-center">
                  <AlertCircle className="text-gold mb-4" size={48} />
                  <h4 className="text-xl font-bold mb-2">Connect Your Wallet</h4>
                  <p className="text-gray-400 mb-6 px-4">Please connect your wallet to view your portfolio and start earning rewards.</p>
                  <button 
                    onClick={connectWallet}
                    className="px-8 py-4 bg-gold text-dark-bg font-bold rounded-2xl"
                  >
                    Connect Wallet
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Rewards Explanation */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4">Fair Reward Distribution</h2>
            <p className="text-gray-400">Our mathematical model is designed for long-term sustainability and fairness.</p>
          </div>
          <div className="p-8 md:p-12 glass-card rounded-[40px] text-center border-gold/20 shadow-[0_0_50px_rgba(255,215,0,0.05)]">
            <p className="text-sm font-bold text-gold uppercase tracking-[0.2em] mb-6">The Formula</p>
            <div className="text-2xl md:text-4xl font-display font-bold">
              Your Reward = <br className="md:hidden" />
              <span className="text-white/40">(</span>
              <span className="text-white">Your Effective Stake</span>
              <span className="text-white/40 font-normal mx-2">÷</span>
              <span className="text-white">Total Staked Points</span>
              <span className="text-white/40">)</span>
              <span className="text-gold mx-4">×</span>
              <span className="text-gold">Total Epoch Rewards</span>
            </div>
            <p className="mt-8 text-gray-500 leading-relaxed italic">
              "This ensures every holder is rewarded proportional to their contribution and commitment time, 
              preventing whales from manipulating reward cycles."
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-gold/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Gem className="text-gold" />, title: "Real Yield BNB", desc: "No inflationary tokens. Rewards are paid in real BNB from trade volume." },
              { icon: <ShieldCheck className="text-gold" />, title: "Price Stability", desc: "Locking mechanism reduces liquid supply and prevents panic selling." },
              { icon: <TrendingUp className="text-gold" />, title: "Guerilla Incentives", desc: "Small holders can compete with whales by locking for longer durations." },
              { icon: <BarChart3 className="text-gold" />, title: "Transparency", desc: "Fully automated on-chain protocol. No central entity control over payouts." }
            ].map((benefit, i) => (
              <div key={i} className="p-8 glass-card rounded-3xl border-white/10 hover:border-gold/40 transition-all">
                <div className="mb-6">{benefit.icon}</div>
                <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 mt-auto border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="text-gold w-6 h-6" />
                <span className="text-2xl font-display font-bold">AIGODS<span className="text-gold">COIN</span></span>
              </div>
              <p className="text-gray-500 max-w-sm mb-6">
                The next generation of AI-driven DeFi staking. 
                Focusing on real yield and long-term sustainability through innovative 
                time-weighted mechanics.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-gold hover:text-dark-bg transition-all italic font-black">X</a>
                <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-gold hover:text-dark-bg transition-all">TG</a>
                <a href="#" className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-gold hover:text-dark-bg transition-all">DS</a>
              </div>
            </div>
            <div>
              <h4 className="font-bold mb-6">Resources</h4>
              <ul className="space-y-4 text-gray-500 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Whitepaper</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Audit Report</a></li>
                <li><a href="#" className="hover:text-white transition-colors flex items-center gap-2">Contract <ExternalLink size={14} /></a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">Privacy</h4>
              <ul className="space-y-4 text-gray-500 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600">
            <p>© 2026 AIGODS COIN. All rights reserved.</p>
            <div className="flex gap-6">
              <span>BSC Mainnet</span>
              <span className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full" /> System Online</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, unit, icon }: { label: string, value: string, unit: string, icon: React.ReactNode }) {
  return (
    <div className="glass-card p-6 rounded-2xl border-white/5 relative overflow-hidden group">
      <div className="absolute -right-4 -bottom-4 text-white/[0.03] scale-150 group-hover:text-gold/[0.05] transition-colors">
        {icon}
      </div>
      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl md:text-3xl font-display font-bold">{value}</span>
        <span className="text-xs font-bold text-gold">{unit}</span>
      </div>
    </div>
  );
}

