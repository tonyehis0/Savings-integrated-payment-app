;; Savings-Integrated Payment App for Developing Markets
;; Built with Clarinet for Stacks Blockchain

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-insufficient-balance (err u101))
(define-constant err-invalid-amount (err u102))
(define-constant err-user-not-found (err u103))
(define-constant err-circle-not-found (err u104))
(define-constant err-already-member (err u105))
(define-constant err-not-member (err u106))
(define-constant err-circle-full (err u107))

;; Block height simulation
(define-data-var current-block uint u1)

;; Helper function to get current block (simulated)
(define-private (get-current-block)
    (var-get current-block)
)

;; Helper function to increment block (for testing/simulation)
(define-public (increment-block)
    (begin
        (var-set current-block (+ (var-get current-block) u1))
        (ok (var-get current-block))
    )
)

;; Data structures
(define-map user-profiles
    { user: principal }
    {
        balance: uint,
        savings-balance: uint,
        auto-save-percentage: uint,
        phone-number: (string-ascii 20),
        created-at: uint
    }
)

(define-map savings-circles
    { circle-id: uint }
    {
        name: (string-ascii 50),
        creator: principal,
        target-amount: uint,
        current-amount: uint,
        member-count: uint,
        max-members: uint,
        contribution-amount: uint,
        payout-frequency: uint, ;; blocks
        next-payout: uint,
        active: bool
    }
)

(define-map circle-members
    { circle-id: uint, member: principal }
    {
        joined-at: uint,
        total-contributed: uint,
        last-contribution: uint
    }
)

(define-map transactions
    { tx-id: uint }
    {
        from: principal,
        to: principal,
        amount: uint,
        tx-type: (string-ascii 20), ;; "payment", "savings", "circle"
        timestamp: uint
    }
)

;; Data variables
(define-data-var next-circle-id uint u1)
(define-data-var next-tx-id uint u1)
(define-data-var platform-fee-rate uint u50) ;; 0.5% in basis points

;; User Management Functions
(define-public (register-user (phone (string-ascii 20)))
    (let ((user tx-sender))
        (if (is-none (map-get? user-profiles { user: user }))
            (begin
                (map-set user-profiles 
                    { user: user }
                    {
                        balance: u0,
                        savings-balance: u0,
                        auto-save-percentage: u10, ;; default 10%
                        phone-number: phone,
                        created-at: (get-current-block)
                    }
                )
                (ok true)
            )
            (ok false) ;; already registered
        )
    )
)

(define-public (deposit-funds (amount uint))
    (let ((user tx-sender)
          (current-profile (unwrap! (map-get? user-profiles { user: user }) err-user-not-found)))
        (if (> amount u0)
            (begin
                (map-set user-profiles
                    { user: user }
                    (merge current-profile { balance: (+ (get balance current-profile) amount) })
                )
                (ok amount)
            )
            err-invalid-amount
        )
    )
)

;; Payment Functions
(define-public (send-payment (recipient principal) (amount uint))
    (let ((sender tx-sender)
          (sender-profile (unwrap! (map-get? user-profiles { user: sender }) err-user-not-found))
          (recipient-profile (unwrap! (map-get? user-profiles { user: recipient }) err-user-not-found))
          (fee (/ (* amount (var-get platform-fee-rate)) u10000))
          (total-deduct (+ amount fee))
          (auto-save-amount (/ (* amount (get auto-save-percentage sender-profile)) u100)))
        
        (asserts! (>= (get balance sender-profile) total-deduct) err-insufficient-balance)
        
        ;; Process payment
        (map-set user-profiles
            { user: sender }
            (merge sender-profile 
                { 
                    balance: (- (get balance sender-profile) total-deduct),
                    savings-balance: (+ (get savings-balance sender-profile) auto-save-amount)
                }
            )
        )
        
        (map-set user-profiles
            { user: recipient }
            (merge recipient-profile 
                { balance: (+ (get balance recipient-profile) amount) }
            )
        )
        
        ;; Record transaction
        (map-set transactions
            { tx-id: (var-get next-tx-id) }
            {
                from: sender,
                to: recipient,
                amount: amount,
                tx-type: "payment",
                timestamp: (get-current-block)
            }
        )
        
        (var-set next-tx-id (+ (var-get next-tx-id) u1))
        (ok amount)
    )
)

;; Savings Functions
(define-public (manual-save (amount uint))
    (let ((user tx-sender)
          (profile (unwrap! (map-get? user-profiles { user: user }) err-user-not-found)))
        
        (asserts! (>= (get balance profile) amount) err-insufficient-balance)
        (asserts! (> amount u0) err-invalid-amount)
        
        (map-set user-profiles
            { user: user }
            (merge profile
                {
                    balance: (- (get balance profile) amount),
                    savings-balance: (+ (get savings-balance profile) amount)
                }
            )
        )
        
        ;; Record savings transaction
        (map-set transactions
            { tx-id: (var-get next-tx-id) }
            {
                from: user,
                to: user,
                amount: amount,
                tx-type: "savings",
                timestamp: (get-current-block)
            }
        )
        
        (var-set next-tx-id (+ (var-get next-tx-id) u1))
        (ok amount)
    )
)

(define-public (withdraw-savings (amount uint))
    (let ((user tx-sender)
          (profile (unwrap! (map-get? user-profiles { user: user }) err-user-not-found)))
        
        (asserts! (>= (get savings-balance profile) amount) err-insufficient-balance)
        (asserts! (> amount u0) err-invalid-amount)
        
        (map-set user-profiles
            { user: user }
            (merge profile
                {
                    balance: (+ (get balance profile) amount),
                    savings-balance: (- (get savings-balance profile) amount)
                }
            )
        )
        
        (ok amount)
    )
)

(define-public (set-auto-save-percentage (percentage uint))
    (let ((user tx-sender)
          (profile (unwrap! (map-get? user-profiles { user: user }) err-user-not-found)))
        
        (asserts! (<= percentage u50) err-invalid-amount) ;; max 50%
        
        (map-set user-profiles
            { user: user }
            (merge profile { auto-save-percentage: percentage })
        )
        
        (ok percentage)
    )
)

;; Savings Circle Functions
(define-public (create-savings-circle 
    (name (string-ascii 50))
    (target-amount uint)
    (max-members uint)
    (contribution-amount uint)
    (payout-frequency uint))
    
    (let ((creator tx-sender)
          (circle-id (var-get next-circle-id))
          (current-block-val (get-current-block)))
        
        (map-set savings-circles
            { circle-id: circle-id }
            {
                name: name,
                creator: creator,
                target-amount: target-amount,
                current-amount: u0,
                member-count: u1,
                max-members: max-members,
                contribution-amount: contribution-amount,
                payout-frequency: payout-frequency,
                next-payout: (+ current-block-val payout-frequency),
                active: true
            }
        )
        
        (map-set circle-members
            { circle-id: circle-id, member: creator }
            {
                joined-at: current-block-val,
                total-contributed: u0,
                last-contribution: u0
            }
        )
        
        (var-set next-circle-id (+ circle-id u1))
        (ok circle-id)
    )
)

(define-public (join-savings-circle (circle-id uint))
    (let ((user tx-sender)
          (circle (unwrap! (map-get? savings-circles { circle-id: circle-id }) err-circle-not-found)))
        
        (asserts! (get active circle) err-circle-not-found)
        (asserts! (< (get member-count circle) (get max-members circle)) err-circle-full)
        (asserts! (is-none (map-get? circle-members { circle-id: circle-id, member: user })) err-already-member)
        
        (map-set circle-members
            { circle-id: circle-id, member: user }
            {
                joined-at: (get-current-block),
                total-contributed: u0,
                last-contribution: u0
            }
        )
        
        (map-set savings-circles
            { circle-id: circle-id }
            (merge circle { member-count: (+ (get member-count circle) u1) })
        )
        
        (ok true)
    )
)

(define-public (contribute-to-circle (circle-id uint))
    (let ((user tx-sender)
          (circle (unwrap! (map-get? savings-circles { circle-id: circle-id }) err-circle-not-found))
          (member-info (unwrap! (map-get? circle-members { circle-id: circle-id, member: user }) err-not-member))
          (user-profile (unwrap! (map-get? user-profiles { user: user }) err-user-not-found))
          (contribution (get contribution-amount circle))
          (current-block-val (get-current-block)))
        
        (asserts! (get active circle) err-circle-not-found)
        (asserts! (>= (get balance user-profile) contribution) err-insufficient-balance)
        
        ;; Deduct from user balance
        (map-set user-profiles
            { user: user }
            (merge user-profile 
                { balance: (- (get balance user-profile) contribution) }
            )
        )
        
        ;; Update circle
        (map-set savings-circles
            { circle-id: circle-id }
            (merge circle 
                { current-amount: (+ (get current-amount circle) contribution) }
            )
        )
        
        ;; Update member contribution
        (map-set circle-members
            { circle-id: circle-id, member: user }
            (merge member-info
                {
                    total-contributed: (+ (get total-contributed member-info) contribution),
                    last-contribution: current-block-val
                }
            )
        )
        
        ;; Record transaction
        (map-set transactions
            { tx-id: (var-get next-tx-id) }
            {
                from: user,
                to: (get creator circle),
                amount: contribution,
                tx-type: "circle",
                timestamp: current-block-val
            }
        )
        
        (var-set next-tx-id (+ (var-get next-tx-id) u1))
        (ok contribution)
    )
)

;; Read-only functions
(define-read-only (get-user-profile (user principal))
    (map-get? user-profiles { user: user })
)

(define-read-only (get-user-balance (user principal))
    (match (map-get? user-profiles { user: user })
        profile (ok (get balance profile))
        err-user-not-found
    )
)

(define-read-only (get-savings-balance (user principal))
    (match (map-get? user-profiles { user: user })
        profile (ok (get savings-balance profile))
        err-user-not-found
    )
)

(define-read-only (get-savings-circle (circle-id uint))
    (map-get? savings-circles { circle-id: circle-id })
)

(define-read-only (get-circle-member-info (circle-id uint) (member principal))
    (map-get? circle-members { circle-id: circle-id, member: member })
)

(define-read-only (get-transaction (tx-id uint))
    (map-get? transactions { tx-id: tx-id })
)

(define-read-only (get-platform-fee-rate)
    (var-get platform-fee-rate)
)

(define-read-only (get-current-block-height)
    (var-get current-block)
)

;; Admin functions
(define-public (set-platform-fee-rate (new-rate uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (<= new-rate u1000) err-invalid-amount) ;; max 10%
        (var-set platform-fee-rate new-rate)
        (ok new-rate)
    )
)