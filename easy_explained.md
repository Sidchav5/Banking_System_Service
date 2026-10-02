# BankFlow: Easy Explained

Welcome to **BankFlow**! This document explains what the project is and how it works in simple, everyday language—without getting bogged down in complex technical jargon.

---

## 1. What is BankFlow?

At its core, **BankFlow** is a modern, fully-functional digital banking simulation. Imagine the app you use on your phone to check your bank balance, send money to friends, or view your transaction history. BankFlow is exactly that, but built from scratch to show how a real bank operates behind the scenes.

It has two main sides:
1. **The Customer Side:** Where you can log in, view your money, add beneficiaries, and transfer funds.
2. **The Bank Staff Side:** A control panel where bank employees can verify user identities (KYC), freeze suspicious accounts, reverse fraudulent transactions, and monitor the overall health of the banking system.

---

## 2. Key Features (What can you do?)

### 👤 User Accounts & Security
When you sign up, you create a profile. Just like a real bank, before you can do anything major, a bank employee has to approve your "KYC" (Know Your Customer) status. You can have different types of accounts, like a Savings account or a Checking account.

### 💸 Sending & Receiving Money
You can send money to other people using the app. 
- **Internal Transfers:** Sending money to someone who also uses BankFlow (instant).
- **Inter-Bank Transfers:** Simulating sending money to a completely different bank (like sending from Chase to Bank of America).

### 🧾 The Ledger (The Bank's Bookkeeper)
Every single time money moves, it is recorded in a highly secure digital ledger. It uses "Double-Entry Accounting." This is a strict rule that says: *If money leaves one place, it must arrive exactly in another place.* Money is never "created" or "destroyed" by accident.

### 🛡️ Bank Staff Controls
Bank employees have a special portal. If someone reports a stolen phone, the staff can instantly **Freeze** the account so no money can leave. If a scam happens, they have a **Reversal Desk** to undo the transaction and return the money to the victim.

### 🤖 The AI Banking Assistant
BankFlow comes with a smart AI chatbot! 
Instead of waiting on hold for customer service, you can type questions into the AI Assistant. 
- You can ask it general questions: *"What is the difference between IMPS and NEFT?"*
- You can ask it about BankFlow: *"Why is my transfer stuck in 'PENDING'?"*
- It is trained on the bank's actual rulebooks, so it gives accurate, safe answers and even shows you exactly which page of the rulebook it got the answer from!

---

## 3. How Does the Money Move? (The Lifecycle of a Transfer)

Let’s say **Alice** wants to send ₹500 to **Bob**. Here is what happens in simple terms:

1. **The Request:** Alice types ₹500, selects Bob, and hits "Send."
2. **The Balance Check:** The bank quickly peeks at Alice's account. Does she actually have ₹500? If yes, it "locks" that ₹500 so she can't spend it twice.
3. **The Movement:** The bank's ledger officially subtracts ₹500 from Alice and adds ₹500 to Bob. 
4. **The Notification:** Both Alice and Bob get a ding on their phone! Alice's app says "Transfer Successful," and Bob's app says "You received ₹500."

If *anything* goes wrong during step 2 or 3 (like the system loses power), the bank automatically cancels the whole thing and unlocks Alice's money. This guarantees that nobody loses their money into thin air.

---

## 4. How Does the AI Assistant Work?

When you ask the AI a question, it doesn't just guess the answer. It uses a technique called **RAG (Retrieval-Augmented Generation)**. Think of it like an open-book exam:
1. You ask a question.
2. The AI quickly runs to the bank's digital library and pulls out the exact paragraphs that talk about your question.
3. It reads those paragraphs and writes a helpful, polite reply for you.
4. It refuses to answer anything that isn't related to banking (like asking for a cake recipe), and it cannot move your money for you (for security reasons).

---

## Summary

BankFlow is a complete digital bank. It safely stores accounts, strictly moves money without making mathematical errors, gives staff the tools to stop fraud, and provides an intelligent AI assistant to help customers 24/7!
