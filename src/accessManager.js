/**
 * Access Management System for Thinkcone Tools
 * 100% Free, Unlimited & Open to all users with zero registration or login needed.
 */

class AccessManager {
  constructor() {
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  getState() {
    return {
      tier: 'free',
      isPro: true, // All pro capabilities unlocked for everyone
      isFreeForever: true,
      remainingToday: Infinity,
      isLoggedIn: false,
      user: null,
    };
  }

  canExecute() {
    return true; // Always free & unrestricted
  }

  consumeQuota() {
    return true; // Always succeeds with no limits
  }

  setTier() {}
  resetQuota() {}
  login() {}
  logout() {}
}

export const accessManager = new AccessManager();

