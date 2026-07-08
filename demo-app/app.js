/* AcmeCorp Invoice Approval — demo target app for FlowLens.
   A hash-routed mini SPA with one deliberately awkward step (the Approve
   button silently requires the verification checkbox) so real friction
   shows up in the mined process. */

FlowLens.init({
  endpoint: '../api/events',
  app: 'invoice-approval',
  caseIdFrom: function () {
    var m = location.hash.match(/(INV-\d+)/);
    return m ? m[1] : null;
  },
  pageNameFrom: function () {
    var h = location.hash;
    if (h.indexOf('#/invoice/') === 0) return 'Invoice detail';
    if (h.indexOf('#/done/') === 0) return 'Confirmation';
    return 'Inbox';
  },
});

var INVOICES = [
  { id: 'INV-1001', vendor: 'Nordic Office Supplies', amount: 1240.5, due: '2026-07-15', lines: [['Standing desks (2)', 980.0], ['Delivery', 260.5]] },
  { id: 'INV-1002', vendor: 'CloudMetrics BV', amount: 3499.0, due: '2026-07-12', lines: [['Observability plan — July', 3499.0]] },
  { id: 'INV-1003', vendor: 'Brightside Catering', amount: 812.75, due: '2026-07-20', lines: [['Team lunch × 25', 687.75], ['Service fee', 125.0]] },
  { id: 'INV-1004', vendor: 'Falcon Logistics', amount: 5230.0, due: '2026-07-11', lines: [['Freight EU-NL', 4890.0], ['Insurance', 340.0]] },
  { id: 'INV-1005', vendor: 'PixelPeach Design', amount: 2150.0, due: '2026-07-25', lines: [['Landing page redesign', 2150.0]] },
  { id: 'INV-1006', vendor: 'Verhoeven Juridisch', amount: 990.0, due: '2026-07-18', lines: [['Contract review 4.5h', 990.0]] },
  { id: 'INV-1007', vendor: 'GreenGrid Energy', amount: 1675.3, due: '2026-07-14', lines: [['Office electricity Q2', 1675.3]] },
  { id: 'INV-1008', vendor: 'Datamere Analytics', amount: 4600.0, due: '2026-07-22', lines: [['Quarterly data license', 4600.0]] },
];

var decisions = {}; // id -> 'approved' | 'rejected'
var view = document.getElementById('view');
var toastEl = document.getElementById('toast');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
}

function money(n) {
  return '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function renderInbox() {
  var rows = INVOICES.map(function (inv) {
    var st = decisions[inv.id]
      ? '<span class="status done">' + decisions[inv.id] + '</span>'
      : '<span class="status">pending</span>';
    return (
      '<tr class="row-invoice" data-flowlens="Open invoice" data-id="' + inv.id + '">' +
      '<td>' + inv.id + '</td><td>' + inv.vendor + '</td><td>' + money(inv.amount) + '</td>' +
      '<td>' + inv.due + '</td><td>' + st + '</td></tr>'
    );
  }).join('');
  view.innerHTML =
    '<div class="card"><h2>Invoice inbox</h2>' +
    '<table><thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  view.querySelectorAll('.row-invoice').forEach(function (tr) {
    tr.addEventListener('click', function () {
      location.hash = '#/invoice/' + tr.dataset.id;
    });
  });
}

function renderInvoice(id) {
  var inv = INVOICES.find(function (i) { return i.id === id; });
  if (!inv) { location.hash = '#/inbox'; return; }
  var lines = inv.lines.map(function (l) {
    return '<tr><td>' + l[0] + '</td><td>' + money(l[1]) + '</td></tr>';
  }).join('');
  view.innerHTML =
    '<a class="back" href="#/inbox" data-flowlens="Back to inbox">← Back to inbox</a>' +
    '<div class="card">' +
    '<h2>' + inv.id + ' — ' + inv.vendor + '</h2>' +
    '<div class="meta">' +
    '<div><span>Amount</span>' + money(inv.amount) + '</div>' +
    '<div><span>Due date</span>' + inv.due + '</div>' +
    '<div><span>Cost center</span>NL-OPS-42</div>' +
    '</div>' +
    '<table><thead><tr><th>Line item</th><th>Amount</th></tr></thead><tbody>' + lines + '</tbody></table>' +
    '<button id="pdf-btn" data-flowlens="View PDF" style="margin-top:12px">View original PDF</button>' +
    '<div class="pdf" id="pdf" hidden>📄 ' + inv.id + '_original.pdf — preview rendered here</div>' +
    '<label class="check"><input type="checkbox" id="verify" data-flowlens="Verify line items" /> I verified the line items against the purchase order</label>' +
    '<div class="actions">' +
    '<button class="primary blocked" id="approve" data-flowlens="Approve invoice">Approve</button>' +
    '<button class="danger" id="reject" data-flowlens="Reject invoice">Reject…</button>' +
    '</div>' +
    '<div id="reject-area" hidden>' +
    '<textarea id="reason" placeholder="Why is this invoice rejected?" aria-label="Rejection reason"></textarea>' +
    '<div class="hint">A reason is required and is sent to the vendor.</div>' +
    '<div class="actions"><button class="danger" id="confirm-reject" data-flowlens="Confirm rejection">Confirm rejection</button></div>' +
    '</div>' +
    '</div>';

  var approve = document.getElementById('approve');
  var verify = document.getElementById('verify');

  document.getElementById('pdf-btn').addEventListener('click', function () {
    var pdf = document.getElementById('pdf');
    pdf.hidden = !pdf.hidden;
  });

  // The awkward step: Approve looks active but silently requires the
  // checkbox. No error message on the first tries — prime rage-click bait.
  approve.addEventListener('click', function () {
    if (!verify.checked) {
      approve.classList.add('shake');
      setTimeout(function () { approve.classList.remove('shake'); }, 350);
      return;
    }
    decisions[inv.id] = 'approved';
    location.hash = '#/done/' + inv.id + '/approved';
  });

  document.getElementById('reject').addEventListener('click', function () {
    document.getElementById('reject-area').hidden = false;
    document.getElementById('reason').focus();
  });

  document.getElementById('confirm-reject').addEventListener('click', function () {
    var reason = document.getElementById('reason').value.trim();
    if (!reason) { toast('Please enter a rejection reason.'); return; }
    decisions[inv.id] = 'rejected';
    location.hash = '#/done/' + inv.id + '/rejected';
  });
}

function renderDone(id, decision) {
  view.innerHTML =
    '<div class="card" style="text-align:center;padding:40px">' +
    '<h2>' + (decision === 'approved' ? '✅ Invoice approved' : '🚫 Invoice rejected') + '</h2>' +
    '<p style="color:#6b7a8c;margin:10px 0 20px">' + id + ' has been ' + decision + ' and the vendor was notified.</p>' +
    '<button class="primary" data-flowlens="Back to inbox" onclick="location.hash=\'#/inbox\'">Back to inbox</button>' +
    '</div>';
}

function route() {
  var h = location.hash;
  var mInvoice = h.match(/^#\/invoice\/(INV-\d+)/);
  var mDone = h.match(/^#\/done\/(INV-\d+)\/(approved|rejected)/);
  if (mInvoice) renderInvoice(mInvoice[1]);
  else if (mDone) renderDone(mDone[1], mDone[2]);
  else renderInbox();
}

window.addEventListener('hashchange', route);
route();
