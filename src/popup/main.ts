import '../ui/popup.css';

const app = document.querySelector<HTMLElement>('#app');

if (app) {
  app.innerHTML = `
    <section class="popup">
      <h1>Twitter AI Blocker</h1>
      <label class="row">
        <span>Auto-hide threshold</span>
        <input type="number" min="0" max="100" value="30" />
      </label>
      <label class="row">
        <span>Human pass threshold</span>
        <input type="number" min="0" max="100" value="70" />
      </label>
      <p>Automatic account blocking is intentionally disabled in this starter build.</p>
    </section>
  `;
}

