// If the app hasn't started after a few seconds (for example, the browser mixed cached and new
// files after an update, or a file failed to load), replace "Loading…" with what to do instead
// of leaving the screen stuck. A classic script, so it runs even when the modules fail to load.
(function () {
  var started = false;
  window.addEventListener('mapper-log-started', function () { started = true; });
  setTimeout(function () {
    if (started) return;
    var app = document.getElementById('app');
    if (!app || !app.querySelector('.loading')) return;
    app.textContent = '';
    var box = document.createElement('section');
    box.className = 'screen';
    var h = document.createElement('h1');
    h.textContent = 'Mapper Log didn’t start';
    var p1 = document.createElement('p');
    p1.textContent = 'Usually this means the browser kept some old files after an update. Your cases are not affected.';
    var p2 = document.createElement('p');
    p2.className = 'muted';
    p2.textContent = 'Close this tab and open the app again. If it still doesn’t start, clear this site’s website data in Safari settings (this also deletes cases stored on this test address).';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-big btn-primary';
    btn.textContent = 'Try again';
    btn.addEventListener('click', function () { location.reload(); });
    box.append(h, p1, p2, btn);
    app.append(box);
  }, 6000);
}());
