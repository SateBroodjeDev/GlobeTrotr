import { safeArray, safeNumber } from './helpers.js';

export function computeBalances(trip) {
  const travellers = safeArray(trip?.reizigers);
  const expenses = safeArray(trip?.kosten);
  const balances = Object.fromEntries(travellers.map((name) => [name, 0]));
  let totalTripCost = 0;

  expenses.forEach((expense) => {
    const amount = safeNumber(expense.omgerekendeEUR ?? expense.amountInEur ?? expense.bedrag);
    totalTripCost += amount;
    const payer = expense.betaaldDoor;
    if (payer && balances[payer] !== undefined) {
      balances[payer] += amount;
    }
    const splitAcross = safeArray(expense.verdeeldOver).length ? expense.verdeeldOver : travellers;
    const share = splitAcross.length ? amount / splitAcross.length : 0;
    splitAcross.forEach((person) => {
      if (balances[person] !== undefined) balances[person] -= share;
    });
  });

  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([name, balance]) => {
    if (balance > 0.01) creditors.push({ name, amount: balance });
    if (balance < -0.01) debtors.push({ name, amount: Math.abs(balance) });
  });

  creditors.sort((left, right) => right.amount - left.amount);
  debtors.sort((left, right) => right.amount - left.amount);

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({
      id: `${debtor.name}-${creditor.name}-${amount.toFixed(2)}`,
      van: debtor.name,
      naar: creditor.name,
      bedrag: amount,
      isPaid: false,
    });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount < 0.01) debtorIndex += 1;
    if (creditor.amount < 0.01) creditorIndex += 1;
  }

  return { balances, totalTripCost, transfers };
}

export function totalsByCategory(expenses = []) {
  return expenses.reduce((accumulator, expense) => {
    const category = expense.categorie || 'Overig';
    accumulator[category] = (accumulator[category] || 0) + safeNumber(expense.omgerekendeEUR ?? expense.bedrag);
    return accumulator;
  }, {});
}

export function budgetActuals(trip) {
  const budget = trip?.budget || {};
  const actuals = {};
  safeArray(trip?.kosten).forEach((expense) => {
    const category = expense.categorie || 'Overig';
    actuals[category] = (actuals[category] || 0) + safeNumber(expense.omgerekendeEUR ?? expense.bedrag);
  });
  return {
    categories: Object.keys(budget),
    budget,
    actuals,
  };
}
