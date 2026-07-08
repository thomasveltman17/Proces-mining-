/* LedgerPro — a mock third-party bookkeeping app. Deliberately contains NO
   FlowLens tracker and no annotations: it can only be observed via the
   FlowLens browser extension, exercising the fully-generic capture path. */

var ACCOUNTS = [
  ['1000', 'Cash', 'Asset'],
  ['1200', 'Accounts receivable', 'Asset'],
  ['2000', 'Accounts payable', 'Liability'],
  ['4000', 'Revenue', 'Income'],
  ['5000', 'Office expenses', 'Expense'],
  ['5100', 'Travel expenses', 'Expense'],
];

var ENTRIES = [
  { id: 'JE-104', date: '2026-07-01', desc: 'Office rent July', debit: '5000', credit: '1000', amount: 2400 },
  { id: 'JE-105', date: '2026-07-03', desc: 'Client payment — Datamere', debit: '1000', credit: '1200', amount: 4600 },
];
var nextId = 106;

var view = document.getElementById('view');

function accountName(code) {
  var a = ACCOUNTS.find(function (x) { return x[0] === code; });
  return a ? a[0] + ' ' + a[1] : code;
}

function renderJournal() {
  var rows = ENTRIES.map(function (e) {
    return (
      '<tr><td>' + e.id + '</td><td>' + e.date + '</td><td>' + e.desc + '</td>' +
      '<td>' + accountName(e.debit) + '</td><td>' + accountName(e.credit) + '</td>' +
      '<td class="amount">€' + e.amount.toFixed(2) + '</td></tr>'
    );
  }).join('');
  view.innerHTML =
    '<div class="sheet">' +
    '<div class="toolbar"><h2>General journal</h2>' +
    '<button class="solid" id="new-entry" aria-label="New journal entry">+ New journal entry</button></div>' +
    '<table><thead><tr><th>Entry</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  document.getElementById('new-entry').addEventListener('click', function () {
    location.hash = '#/journal/new';
  });
}

function renderNewEntry() {
  var options = ACCOUNTS.map(function (a) {
    return '<option value="' + a[0] + '">' + a[0] + ' — ' + a[1] + ' (' + a[2] + ')</option>';
  }).join('');
  view.innerHTML =
    '<div class="sheet">' +
    '<h2>New journal entry</h2>' +
    '<div class="row2">' +
    '<div><label for="je-date">Date</label><input type="date" id="je-date" value="2026-07-08" /></div>' +
    '<div><label for="je-amount">Amount (€)</label><input type="number" id="je-amount" placeholder="0.00" /></div>' +
    '</div>' +
    '<label for="je-desc">Description</label><input type="text" id="je-desc" placeholder="What is this entry for?" />' +
    '<div class="row2">' +
    '<div><label for="je-debit">Debit account</label><select id="je-debit">' + options + '</select></div>' +
    '<div><label for="je-credit">Credit account</label><select id="je-credit">' + options + '</select></div>' +
    '</div>' +
    '<div style="margin-top:18px;display:flex;gap:10px">' +
    '<button class="solid" id="post-entry" aria-label="Post journal entry">Post entry</button>' +
    '<button id="cancel-entry" aria-label="Cancel journal entry">Cancel</button>' +
    '</div></div>';

  document.getElementById('post-entry').addEventListener('click', function () {
    var amount = parseFloat(document.getElementById('je-amount').value || '0');
    var id = 'JE-' + nextId++;
    ENTRIES.push({
      id: id,
      date: document.getElementById('je-date').value,
      desc: document.getElementById('je-desc').value || '(no description)',
      debit: document.getElementById('je-debit').value,
      credit: document.getElementById('je-credit').value,
      amount: isNaN(amount) ? 0 : amount,
    });
    location.hash = '#/posted/' + id;
  });
  document.getElementById('cancel-entry').addEventListener('click', function () {
    location.hash = '#/journal';
  });
}

function renderPosted(id) {
  view.innerHTML =
    '<div class="sheet posted">' +
    '<div class="big">✓ Entry ' + id + ' posted to the ledger</div>' +
    '<div class="muted">Balances have been updated.</div>' +
    '<div style="margin-top:20px"><button class="solid" id="back-journal" aria-label="Back to journal">Back to journal</button></div>' +
    '</div>';
  document.getElementById('back-journal').addEventListener('click', function () {
    location.hash = '#/journal';
  });
}

function renderAccounts() {
  var rows = ACCOUNTS.map(function (a) {
    return '<tr><td>' + a[0] + '</td><td>' + a[1] + '</td><td>' + a[2] + '</td></tr>';
  }).join('');
  view.innerHTML =
    '<div class="sheet"><h2>Chart of accounts</h2>' +
    '<table><thead><tr><th>Code</th><th>Account</th><th>Type</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function route() {
  var h = location.hash || '#/journal';
  document.getElementById('nav-journal').className = h.indexOf('#/journal') === 0 ? 'active' : '';
  document.getElementById('nav-accounts').className = h === '#/accounts' ? 'active' : '';
  var mPosted = h.match(/^#\/posted\/(JE-\d+)/);
  if (h === '#/journal/new') renderNewEntry();
  else if (mPosted) renderPosted(mPosted[1]);
  else if (h === '#/accounts') renderAccounts();
  else renderJournal();
}

window.addEventListener('hashchange', route);
route();
