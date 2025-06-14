import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Clarity contract functions and data structures
class MockClarityContract {
  constructor() {
    this.reset()
  }

  reset() {
    this.currentBlock = 1
    this.userProfiles = new Map()
    this.savingsCircles = new Map()
    this.circleMembers = new Map()
    this.transactions = new Map()
    this.nextCircleId = 1
    this.nextTxId = 1
    this.platformFeeRate = 50 // 0.5%
    this.contractOwner = 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE'
  }

  // Helper functions
  getCurrentBlock() {
    return this.currentBlock
  }

  incrementBlock() {
    this.currentBlock++
    return { ok: this.currentBlock }
  }

  // User Management Functions
  registerUser(phone, sender) {
    const userKey = sender
    if (!this.userProfiles.has(userKey)) {
      this.userProfiles.set(userKey, {
        balance: 0,
        savingsBalance: 0,
        autoSavePercentage: 10,
        phoneNumber: phone,
        createdAt: this.getCurrentBlock()
      })
      return { ok: true }
    }
    return { ok: false }
  }

  depositFunds(amount, sender) {
    const profile = this.userProfiles.get(sender)
    if (!profile) return { err: 103 } // err-user-not-found
    
    if (amount > 0) {
      profile.balance += amount
      return { ok: amount }
    }
    return { err: 102 } // err-invalid-amount
  }

  // Payment Functions
  sendPayment(recipient, amount, sender) {
    const senderProfile = this.userProfiles.get(sender)
    const recipientProfile = this.userProfiles.get(recipient)
    
    if (!senderProfile) return { err: 103 }
    if (!recipientProfile) return { err: 103 }
    
    const fee = Math.floor((amount * this.platformFeeRate) / 10000)
    const totalDeduct = amount + fee
    const autoSaveAmount = Math.floor((amount * senderProfile.autoSavePercentage) / 100)
    
    if (senderProfile.balance < totalDeduct) return { err: 101 }
    
    // Process payment
    senderProfile.balance -= totalDeduct
    senderProfile.savingsBalance += autoSaveAmount
    recipientProfile.balance += amount
    
    // Record transaction
    this.transactions.set(this.nextTxId, {
      from: sender,
      to: recipient,
      amount: amount,
      txType: 'payment',
      timestamp: this.getCurrentBlock()
    })
    
    this.nextTxId++
    return { ok: amount }
  }

  // Savings Functions
  manualSave(amount, sender) {
    const profile = this.userProfiles.get(sender)
    if (!profile) return { err: 103 }
    
    if (profile.balance < amount) return { err: 101 }
    if (amount <= 0) return { err: 102 }
    
    profile.balance -= amount
    profile.savingsBalance += amount
    
    // Record transaction
    this.transactions.set(this.nextTxId, {
      from: sender,
      to: sender,
      amount: amount,
      txType: 'savings',
      timestamp: this.getCurrentBlock()
    })
    
    this.nextTxId++
    return { ok: amount }
  }

  withdrawSavings(amount, sender) {
    const profile = this.userProfiles.get(sender)
    if (!profile) return { err: 103 }
    
    if (profile.savingsBalance < amount) return { err: 101 }
    if (amount <= 0) return { err: 102 }
    
    profile.balance += amount
    profile.savingsBalance -= amount
    
    return { ok: amount }
  }

  setAutoSavePercentage(percentage, sender) {
    const profile = this.userProfiles.get(sender)
    if (!profile) return { err: 103 }
    
    if (percentage > 50) return { err: 102 }
    
    profile.autoSavePercentage = percentage
    return { ok: percentage }
  }

  // Savings Circle Functions
  createSavingsCircle(name, targetAmount, maxMembers, contributionAmount, payoutFrequency, creator) {
    const circleId = this.nextCircleId
    const currentBlockVal = this.getCurrentBlock()
    
    this.savingsCircles.set(circleId, {
      name: name,
      creator: creator,
      targetAmount: targetAmount,
      currentAmount: 0,
      memberCount: 1,
      maxMembers: maxMembers,
      contributionAmount: contributionAmount,
      payoutFrequency: payoutFrequency,
      nextPayout: currentBlockVal + payoutFrequency,
      active: true
    })
    
    this.circleMembers.set(`${circleId}-${creator}`, {
      joinedAt: currentBlockVal,
      totalContributed: 0,
      lastContribution: 0
    })
    
    this.nextCircleId++
    return { ok: circleId }
  }

  joinSavingsCircle(circleId, user) {
    const circle = this.savingsCircles.get(circleId)
    if (!circle) return { err: 104 }
    if (!circle.active) return { err: 104 }
    if (circle.memberCount >= circle.maxMembers) return { err: 107 }
    if (this.circleMembers.has(`${circleId}-${user}`)) return { err: 105 }
    
    this.circleMembers.set(`${circleId}-${user}`, {
      joinedAt: this.getCurrentBlock(),
      totalContributed: 0,
      lastContribution: 0
    })
    
    circle.memberCount++
    return { ok: true }
  }

  contributeToCircle(circleId, user) {
    const circle = this.savingsCircles.get(circleId)
    const memberInfo = this.circleMembers.get(`${circleId}-${user}`)
    const userProfile = this.userProfiles.get(user)
    
    if (!circle) return { err: 104 }
    if (!memberInfo) return { err: 106 }
    if (!userProfile) return { err: 103 }
    if (!circle.active) return { err: 104 }
    
    const contribution = circle.contributionAmount
    if (userProfile.balance < contribution) return { err: 101 }
    
    // Process contribution
    userProfile.balance -= contribution
    circle.currentAmount += contribution
    memberInfo.totalContributed += contribution
    memberInfo.lastContribution = this.getCurrentBlock()
    
    // Record transaction
    this.transactions.set(this.nextTxId, {
      from: user,
      to: circle.creator,
      amount: contribution,
      txType: 'circle',
      timestamp: this.getCurrentBlock()
    })
    
    this.nextTxId++
    return { ok: contribution }
  }

  // Read-only functions
  getUserProfile(user) {
    return this.userProfiles.get(user) || null
  }

  getUserBalance(user) {
    const profile = this.userProfiles.get(user)
    return profile ? { ok: profile.balance } : { err: 103 }
  }

  getSavingsBalance(user) {
    const profile = this.userProfiles.get(user)
    return profile ? { ok: profile.savingsBalance } : { err: 103 }
  }

  getSavingsCircle(circleId) {
    return this.savingsCircles.get(circleId) || null
  }

  getCircleMemberInfo(circleId, member) {
    return this.circleMembers.get(`${circleId}-${member}`) || null
  }

  getTransaction(txId) {
    return this.transactions.get(txId) || null
  }

  getPlatformFeeRate() {
    return this.platformFeeRate
  }

  getCurrentBlockHeight() {
    return this.currentBlock
  }

  // Admin functions
  setPlatformFeeRate(newRate, sender) {
    if (sender !== this.contractOwner) return { err: 100 }
    if (newRate > 1000) return { err: 102 }
    
    this.platformFeeRate = newRate
    return { ok: newRate }
  }
}

// Test Suite
describe('Savings-Integrated Payment App', () => {
  let contract
  const alice = 'ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE'
  const bob = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG'
  const charlie = 'ST2JHG361ZXG51QTQAADT2NQU2SPQN4XDAEVX9H9V'

  beforeEach(() => {
    contract = new MockClarityContract()
  })

  describe('User Management', () => {
    it('should register a new user successfully', () => {
      const result = contract.registerUser('+1234567890', alice)
      expect(result).toEqual({ ok: true })
      
      const profile = contract.getUserProfile(alice)
      expect(profile).toEqual({
        balance: 0,
        savingsBalance: 0,
        autoSavePercentage: 10,
        phoneNumber: '+1234567890',
        createdAt: 1
      })
    })

    it('should return false when registering existing user', () => {
      contract.registerUser('+1234567890', alice)
      const result = contract.registerUser('+0987654321', alice)
      expect(result).toEqual({ ok: false })
    })

    it('should deposit funds successfully', () => {
      contract.registerUser('+1234567890', alice)
      const result = contract.depositFunds(1000, alice)
      expect(result).toEqual({ ok: 1000 })
      
      const balance = contract.getUserBalance(alice)
      expect(balance).toEqual({ ok: 1000 })
    })

    it('should reject invalid deposit amount', () => {
      contract.registerUser('+1234567890', alice)
      const result = contract.depositFunds(0, alice)
      expect(result).toEqual({ err: 102 })
    })

    it('should reject deposit for non-existent user', () => {
      const result = contract.depositFunds(1000, alice)
      expect(result).toEqual({ err: 103 })
    })
  })

  describe('Payment Functions', () => {
    beforeEach(() => {
      contract.registerUser('+1234567890', alice)
      contract.registerUser('+0987654321', bob)
      contract.depositFunds(1000, alice)
    })

    it('should send payment successfully with auto-save', () => {
      const result = contract.sendPayment(bob, 100, alice)
      expect(result).toEqual({ ok: 100 })
      
      // Check balances
      const aliceBalance = contract.getUserBalance(alice)
      const bobBalance = contract.getUserBalance(bob)
      const aliceSavings = contract.getSavingsBalance(alice)
      
      // Alice should have: 1000 - 100 - 0.5 (fee) = 899.5, rounded to 899
      expect(aliceBalance.ok).toBeLessThan(900)
      expect(bobBalance).toEqual({ ok: 100 })
      expect(aliceSavings.ok).toBeGreaterThan(0) // Auto-save should be applied
    })

    it('should reject payment with insufficient balance', () => {
      const result = contract.sendPayment(bob, 2000, alice)
      expect(result).toEqual({ err: 101 })
    })

    it('should reject payment to non-existent recipient', () => {
      const result = contract.sendPayment(charlie, 100, alice)
      expect(result).toEqual({ err: 103 })
    })

    it('should record transaction correctly', () => {
      contract.sendPayment(bob, 100, alice)
      const transaction = contract.getTransaction(1)
      
      expect(transaction).toEqual({
        from: alice,
        to: bob,
        amount: 100,
        txType: 'payment',
        timestamp: 1
      })
    })
  })

  describe('Savings Functions', () => {
    beforeEach(() => {
      contract.registerUser('+1234567890', alice)
      contract.depositFunds(1000, alice)
    })

    it('should save money manually', () => {
      const result = contract.manualSave(200, alice)
      expect(result).toEqual({ ok: 200 })
      
      const balance = contract.getUserBalance(alice)
      const savings = contract.getSavingsBalance(alice)
      
      expect(balance).toEqual({ ok: 800 })
      expect(savings).toEqual({ ok: 200 })
    })

    it('should withdraw savings successfully', () => {
      contract.manualSave(200, alice)
      const result = contract.withdrawSavings(100, alice)
      expect(result).toEqual({ ok: 100 })
      
      const balance = contract.getUserBalance(alice)
      const savings = contract.getSavingsBalance(alice)
      
      expect(balance).toEqual({ ok: 900 })
      expect(savings).toEqual({ ok: 100 })
    })

    it('should reject withdrawal exceeding savings balance', () => {
      contract.manualSave(200, alice)
      const result = contract.withdrawSavings(300, alice)
      expect(result).toEqual({ err: 101 })
    })

    it('should set auto-save percentage', () => {
      const result = contract.setAutoSavePercentage(25, alice)
      expect(result).toEqual({ ok: 25 })
      
      const profile = contract.getUserProfile(alice)
      expect(profile.autoSavePercentage).toBe(25)
    })

    it('should reject auto-save percentage above 50%', () => {
      const result = contract.setAutoSavePercentage(60, alice)
      expect(result).toEqual({ err: 102 })
    })
  })

  describe('Savings Circle Functions', () => {
    beforeEach(() => {
      contract.registerUser('+1234567890', alice)
      contract.registerUser('+0987654321', bob)
      contract.registerUser('+1122334455', charlie)
      contract.depositFunds(1000, alice)
      contract.depositFunds(1000, bob)
      contract.depositFunds(1000, charlie)
    })

    it('should create savings circle successfully', () => {
      const result = contract.createSavingsCircle(
        'Family Savings',
        5000,
        5,
        100,
        30,
        alice
      )
      expect(result).toEqual({ ok: 1 })
      
      const circle = contract.getSavingsCircle(1)
      expect(circle).toEqual({
        name: 'Family Savings',
        creator: alice,
        targetAmount: 5000,
        currentAmount: 0,
        memberCount: 1,
        maxMembers: 5,
        contributionAmount: 100,
        payoutFrequency: 30,
        nextPayout: 31,
        active: true
      })
    })

    it('should join savings circle successfully', () => {
      contract.createSavingsCircle('Family Savings', 5000, 5, 100, 30, alice)
      const result = contract.joinSavingsCircle(1, bob)
      expect(result).toEqual({ ok: true })
      
      const circle = contract.getSavingsCircle(1)
      expect(circle.memberCount).toBe(2)
      
      const memberInfo = contract.getCircleMemberInfo(1, bob)
      expect(memberInfo).toEqual({
        joinedAt: 1,
        totalContributed: 0,
        lastContribution: 0
      })
    })

    it('should reject joining full circle', () => {
      contract.createSavingsCircle('Small Circle', 1000, 2, 100, 30, alice)
      contract.joinSavingsCircle(1, bob)
      const result = contract.joinSavingsCircle(1, charlie)
      expect(result).toEqual({ err: 107 })
    })

    it('should reject duplicate member', () => {
      contract.createSavingsCircle('Family Savings', 5000, 5, 100, 30, alice)
      const result = contract.joinSavingsCircle(1, alice)
      expect(result).toEqual({ err: 105 })
    })

    it('should contribute to circle successfully', () => {
      contract.createSavingsCircle('Family Savings', 5000, 5, 100, 30, alice)
      contract.joinSavingsCircle(1, bob)
      
      const result = contract.contributeToCircle(1, bob)
      expect(result).toEqual({ ok: 100 })
      
      const circle = contract.getSavingsCircle(1)
      expect(circle.currentAmount).toBe(100)
      
      const memberInfo = contract.getCircleMemberInfo(1, bob)
      expect(memberInfo.totalContributed).toBe(100)
      
      const bobBalance = contract.getUserBalance(bob)
      expect(bobBalance).toEqual({ ok: 900 })
    })

    it('should reject contribution with insufficient balance', () => {
      contract.createSavingsCircle('Expensive Circle', 5000, 5, 2000, 30, alice)
      contract.joinSavingsCircle(1, bob)
      
      const result = contract.contributeToCircle(1, bob)
      expect(result).toEqual({ err: 101 })
    })

    it('should reject contribution from non-member', () => {
      contract.createSavingsCircle('Family Savings', 5000, 5, 100, 30, alice)
      
      const result = contract.contributeToCircle(1, bob)
      expect(result).toEqual({ err: 106 })
    })
  })

  describe('Admin Functions', () => {
    it('should allow owner to set platform fee rate', () => {
      const result = contract.setPlatformFeeRate(75, alice)
      expect(result).toEqual({ ok: 75 })
      expect(contract.getPlatformFeeRate()).toBe(75)
    })

    it('should reject non-owner setting fee rate', () => {
      const result = contract.setPlatformFeeRate(75, bob)
      expect(result).toEqual({ err: 100 })
    })

    it('should reject fee rate above 10%', () => {
      const result = contract.setPlatformFeeRate(1500, alice)
      expect(result).toEqual({ err: 102 })
    })
  })

  describe('Block Height Simulation', () => {
    it('should increment block height', () => {
      expect(contract.getCurrentBlockHeight()).toBe(1)
      
      const result = contract.incrementBlock()
      expect(result).toEqual({ ok: 2 })
      expect(contract.getCurrentBlockHeight()).toBe(2)
    })

    it('should use correct timestamps in transactions', () => {
      contract.registerUser('+1234567890', alice)
      contract.registerUser('+0987654321', bob)
      contract.depositFunds(1000, alice)
      
      contract.incrementBlock()
      contract.sendPayment(bob, 100, alice)
      
      const transaction = contract.getTransaction(1)
      expect(transaction.timestamp).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero amounts properly', () => {
      contract.registerUser('+1234567890', alice)
      contract.depositFunds(1000, alice)
      
      const result = contract.manualSave(0, alice)
      expect(result).toEqual({ err: 102 })
    })

    it('should handle non-existent circle operations', () => {
      contract.registerUser('+1234567890', alice)
      
      const joinResult = contract.joinSavingsCircle(999, alice)
      expect(joinResult).toEqual({ err: 104 })
      
      const contributeResult = contract.contributeToCircle(999, alice)
      expect(contributeResult).toEqual({ err: 104 })
    })

    it('should handle non-existent transactions', () => {
      const transaction = contract.getTransaction(999)
      expect(transaction).toBeNull()
    })
  })
})