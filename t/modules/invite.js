// Owner: invite link + QR code, copy, and a new code (old links stop working). Needs editor.js (sheet).
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const QR_SRC = 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js';
  const newCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = ''; crypto.getRandomValues(new Uint32Array(10)).forEach(x => { s += a[x % a.length]; }); return s; };
  const linkFor = (tripId, code) => `${location.origin}/t/?id=${encodeURIComponent(tripId)}&join=${encodeURIComponent(code)}`;
  function loadQR() { return window.qrcode ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = QR_SRC; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  async function qrSvg(text) { await loadQR(); const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } }

  function open({ fs, tripId, trip, onChanged }) {
    let code = trip.joinCode;
    const s = TripEditor.sheet('邀请同行的人', `<div class="inv">
      <p class="sub">把链接发给同行的朋友（微信、短信都行）。他们打开后自动加入，再选一下「我是谁」就能记账、打勾、编辑行程。</p>
      <div class="inv-qr" id="invQr" aria-label="邀请二维码"></div>
      <div class="inv-link"><code id="invLink"></code></div>
      <div class="row"><button type="button" class="btn btn-primary" id="invCopy"><i data-lucide="copy" class="i18"></i>复制邀请链接</button>
        <button type="button" class="btn ghost" id="invNew"><i data-lucide="refresh-cw" class="i18"></i>重新生成邀请码</button></div>
      <p class="sub">重新生成以后，旧的邀请链接就不能再用来加入；已经加入的人不受影响。</p>
      <textarea id="invFallback" rows="2" readonly hidden></textarea></div>`);
    const draw = async () => {
      const url = linkFor(tripId, code); s.body.querySelector('#invLink').textContent = url;
      try { s.body.querySelector('#invQr').innerHTML = await qrSvg(url); } catch (e) { s.body.querySelector('#invQr').textContent = '二维码加载失败，直接复制链接就行。'; }
    };
    draw();
    s.body.querySelector('#invCopy').onclick = async () => {
      const url = linkFor(tripId, code);
      if (await copy(url)) TripEditor.toast('邀请链接已复制');
      else { const t = s.body.querySelector('#invFallback'); t.hidden = false; t.value = url; t.select(); TripEditor.toast('已选中，请手动复制'); }
    };
    let armed = false;
    s.body.querySelector('#invNew').onclick = async e => {
      const b = e.currentTarget;
      if (!armed) { armed = true; b.innerHTML = '<i data-lucide="refresh-cw" class="i18"></i>确认：旧链接失效？'; try { lucide.createIcons({ root: b }); } catch (er) {} setTimeout(() => { armed = false; }, 4000); return; }
      armed = false; b.disabled = true;
      try { code = newCode(); await fs.doc('trips/' + tripId).update({ joinCode: code, updatedAt: Date.now() }); await draw(); TripEditor.toast('已换成新的邀请码'); onChanged && onChanged(code); }
      catch (er) { TripEditor.toast('没换成：' + (er.code || er.message)); }
      b.disabled = false; b.innerHTML = '<i data-lucide="refresh-cw" class="i18"></i>重新生成邀请码'; try { lucide.createIcons({ root: b }); } catch (er) {}
    };
  }
  window.TripInvite = { open, linkFor, copy, newCode };
})();
