/* Maison Oak storefront logic: catalog, filters, product detail, cart, wishlist, checkout */
(function () {
  "use strict";

  const SHIPPING_THRESHOLD = 999;
  const SHIPPING_FEE = 49;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (n) => "$" + n.toLocaleString("en-US");
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- State (persisted per browser, guarded) ---------- */
  const store = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    save(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };

  const state = {
    cart: store.load("mo-cart", []),        // [{ id, qty }]
    wishlist: store.load("mo-wishlist", []), // [id]
    filters: { category: "All", search: "", maxPrice: 5000, sort: "featured", inStock: false }
  };

  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const persist = () => {
    store.save("mo-cart", state.cart);
    store.save("mo-wishlist", state.wishlist);
  };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- Product card markup ---------- */
  function cardHtml(p, i) {
    const wished = state.wishlist.includes(p.id);
    const tag = p.oldPrice ? '<span class="tag sale">Sale</span>'
      : p.badge === "New" ? '<span class="tag new">New</span>'
      : p.badge ? `<span class="tag">${escapeHtml(p.badge)}</span>` : "";
    const price = p.oldPrice
      ? `${money(p.price)}<s>${money(p.oldPrice)}</s>`
      : money(p.price);
    return `
      <article class="product-card" style="animation-delay:${Math.min(i, 8) * 60}ms">
        <div class="media" data-open="${p.id}" tabindex="0" role="button" aria-label="View ${escapeHtml(p.name)}">
          ${tag}
          <img src="${p.image}" alt="${escapeHtml(p.name)} in ${escapeHtml(p.color)}" loading="lazy" />
          <div class="fallback" style="background:${p.tint}">${escapeHtml(p.name)}</div>
          <button class="wish-btn ${wished ? "on" : ""}" data-wish="${p.id}" aria-label="${wished ? "Remove from" : "Add to"} wishlist" aria-pressed="${wished}">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>
          </button>
          <button class="quick-add" data-add="${p.id}" ${p.stock ? "" : "disabled"}>
            ${p.stock ? "Add to cart" : "Sold out"}
          </button>
        </div>
        <div class="product-info">
          <div class="cat">${escapeHtml(p.category)}</div>
          <h3 data-open="${p.id}">${escapeHtml(p.name)}</h3>
          <div class="product-meta">
            <span class="price">${price}</span>
            <span class="rating"><b>★</b> ${p.rating.toFixed(1)} (${p.reviews})</span>
          </div>
          ${p.stock ? "" : '<div class="out">Currently unavailable</div>'}
        </div>
      </article>`;
  }

  /* ---------- Catalog rendering ---------- */
  function getFiltered() {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();
    let list = PRODUCTS.filter((p) =>
      (f.category === "All" || p.category === f.category) &&
      p.price <= f.maxPrice &&
      (!f.inStock || p.stock) &&
      (!q || (p.name + " " + p.category + " " + p.color + " " + p.material).toLowerCase().includes(q))
    );
    const sorters = {
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
      name: (a, b) => a.name.localeCompare(b.name)
    };
    if (sorters[f.sort]) list = list.sort(sorters[f.sort]);
    return list;
  }

  function renderGrid() {
    const list = getFiltered();
    $("#productGrid").innerHTML = list.map(cardHtml).join("");
    $("#emptyState").hidden = list.length > 0;
    $("#resultCount").textContent = `Showing ${list.length} of ${PRODUCTS.length} pieces`;
    $$("#filterChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === state.filters.category));
    $$(".main-nav a[data-category]").forEach((a) => a.classList.toggle("current", a.dataset.category === state.filters.category));
  }

  function setCategory(cat) {
    state.filters.category = cat;
    renderGrid();
  }

  /* ---------- Product modal ---------- */
  let modalQty = 1;
  let modalProduct = null;

  function openProduct(id) {
    const p = byId(id);
    if (!p) return;
    modalProduct = p;
    modalQty = 1;
    renderProductModal();
    openOverlay("#productModal");
  }

  function renderProductModal() {
    const p = modalProduct;
    const wished = state.wishlist.includes(p.id);
    const price = p.oldPrice
      ? `${money(p.price)}<s>${money(p.oldPrice)}</s>`
      : money(p.price);
    $("#modalBody").innerHTML = `
      <div class="gallery">
        <img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.outerHTML='<div class=&quot;fallback-big&quot; style=&quot;background:${p.tint}&quot;>${escapeHtml(p.name)}</div>'" />
      </div>
      <div class="details">
        <span class="cat">${escapeHtml(p.category)} · ${escapeHtml(p.color)}</span>
        <h2 id="modalTitle">${escapeHtml(p.name)}</h2>
        <div class="rating"><b>★</b> ${p.rating.toFixed(1)} · ${p.reviews} reviews</div>
        <div class="price-big">${price}</div>
        <p>${escapeHtml(p.description)}</p>
        <ul>
          <li><span>Material</span><span>${escapeHtml(p.material)}</span></li>
          <li><span>Dimensions</span><span>${escapeHtml(p.dimensions)}</span></li>
          <li><span>Availability</span><span>${p.stock ? "In stock · ships in 5–7 days" : "Sold out"}</span></li>
        </ul>
        <div class="qty" role="group" aria-label="Quantity">
          <button id="qtyMinus" aria-label="Decrease quantity">−</button>
          <span id="qtyVal" aria-live="polite">${modalQty}</span>
          <button id="qtyPlus" aria-label="Increase quantity">+</button>
        </div>
        <div class="buy-row">
          <button class="btn btn-primary" id="modalAdd" ${p.stock ? "" : "disabled"}>
            ${p.stock ? "Add to cart" : "Sold out"}
          </button>
          <button class="wish-inline ${wished ? "on" : ""}" id="modalWish" aria-label="Toggle wishlist" aria-pressed="${wished}">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>
          </button>
        </div>
        <div class="perks">
          <span>✓ Free white-glove delivery over $999</span>
          <span>✓ 10-year frame warranty</span>
          <span>✓ 30-day returns</span>
        </div>
      </div>`;
  }

  /* ---------- Overlays ---------- */
  let lastFocus = null;
  function openOverlay(sel) {
    lastFocus = document.activeElement;
    const el = $(sel);
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const focusable = el.querySelector("button, input, a");
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }
  function closeOverlay(sel) {
    const el = $(sel);
    if (!el || !el.classList.contains("open")) return;
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    if (!$$(".modal.open, .drawer.open").length) document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function closeAllOverlays() {
    ["#productModal", "#checkoutModal", "#cartDrawer", "#wishDrawer"].forEach(closeOverlay);
  }

  /* ---------- Cart ---------- */
  function addToCart(id, qty = 1) {
    const p = byId(id);
    if (!p || !p.stock) return;
    const line = state.cart.find((l) => l.id === id);
    if (line) line.qty += qty; else state.cart.push({ id, qty });
    persist();
    updateBadges(true);
    renderCart();
    toast(`${p.name} added to your cart`);
  }

  function setQty(id, qty) {
    const line = state.cart.find((l) => l.id === id);
    if (!line) return;
    line.qty = Math.max(1, Math.min(10, qty));
    persist();
    renderCart();
    updateBadges(false);
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter((l) => l.id !== id);
    persist();
    renderCart();
    updateBadges(false);
  }

  function cartTotals() {
    const subtotal = state.cart.reduce((sum, l) => {
      const p = byId(l.id);
      return p ? sum + p.price * l.qty : sum;
    }, 0);
    const shipping = subtotal === 0 ? 0 : subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    return { subtotal, shipping, total: subtotal + shipping, count: state.cart.reduce((n, l) => n + l.qty, 0) };
  }

  function renderCart() {
    const box = $("#cartItems");
    const t = cartTotals();
    if (!state.cart.length) {
      box.innerHTML = `
        <div class="cart-empty">
          <h4>Your cart is empty</h4>
          <p>Discover pieces that make a house a home.</p>
          <button class="btn btn-ghost" data-close-cart>Continue shopping</button>
        </div>`;
    } else {
      box.innerHTML = state.cart.map((l) => {
        const p = byId(l.id);
        if (!p) return "";
        return `
          <div class="line-item">
            <img src="${p.image}" alt="" onerror="this.style.background='${p.tint}';this.removeAttribute('src')" />
            <div>
              <h5>${escapeHtml(p.name)}</h5>
              <div class="unit">${money(p.price)} · ${escapeHtml(p.color)}</div>
              <div class="actions">
                <div class="qty">
                  <button data-dec="${p.id}" aria-label="Decrease quantity">−</button>
                  <span>${l.qty}</span>
                  <button data-inc="${p.id}" aria-label="Increase quantity">+</button>
                </div>
                <span class="line-total">${money(p.price * l.qty)}</span>
              </div>
              <button class="remove" data-remove="${p.id}">Remove</button>
            </div>
          </div>`;
      }).join("");
    }
    $("#cartSubtotal").textContent = money(t.subtotal);
    $("#cartShipping").textContent = !t.count ? "—"
      : t.shipping === 0 ? "Free" : money(t.shipping);
    $("#checkoutBtn").disabled = !state.cart.length;
  }

  /* ---------- Wishlist ---------- */
  function toggleWish(id) {
    const p = byId(id);
    if (!p) return;
    const on = state.wishlist.includes(id);
    state.wishlist = on ? state.wishlist.filter((x) => x !== id) : [...state.wishlist, id];
    persist();
    toast(on ? `Removed ${p.name} from wishlist` : `Saved ${p.name} to wishlist`);
    updateWishBadge();
    renderGrid();
    renderWishlist();
    if (modalProduct && modalProduct.id === id) renderProductModal();
  }

  function renderWishlist() {
    const box = $("#wishItems");
    if (!state.wishlist.length) {
      box.innerHTML = `<div class="cart-empty"><h4>No saved pieces yet</h4><p>Tap the heart on any piece to save it here.</p></div>`;
      return;
    }
    box.innerHTML = state.wishlist.map((id) => {
      const p = byId(id);
      if (!p) return "";
      return `
        <div class="line-item">
          <img src="${p.image}" alt="" onerror="this.style.background='${p.tint}';this.removeAttribute('src')" />
          <div>
            <h5>${escapeHtml(p.name)}</h5>
            <div class="unit">${money(p.price)}</div>
            <button class="wish-move" data-move-cart="${p.id}" ${p.stock ? "" : "disabled"}>${p.stock ? "Move to cart" : "Sold out"}</button>
            <button class="remove" data-unwish="${p.id}">Remove</button>
          </div>
          <span></span>
        </div>`;
    }).join("");
  }

  /* ---------- Badges ---------- */
  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  function updateBadges(animate) {
    const c = cartTotals().count;
    const el = $("#cartCount");
    el.textContent = c;
    el.classList.toggle("show", c > 0);
    if (animate) bump(el);
    updateWishBadge();
  }
  function updateWishBadge() {
    const n = state.wishlist.length;
    const el = $("#wishCount");
    el.textContent = n;
    el.classList.toggle("show", n > 0);
  }

  /* ---------- Checkout ---------- */
  function openCheckout() {
    if (!state.cart.length) return;
    closeOverlay("#cartDrawer");
    const t = cartTotals();
    $("#checkoutBody").innerHTML = `
      <h2 id="checkoutTitle">Checkout</h2>
      <p class="lead">Secure checkout · Free delivery on orders over $999</p>
      <form id="checkoutForm" novalidate>
        <label>Full name<input name="name" autocomplete="name" required /><span class="field-err"></span></label>
        <label>Email<input name="email" type="email" autocomplete="email" required /><span class="field-err"></span></label>
        <label>Street address<input name="address" autocomplete="street-address" required /><span class="field-err"></span></label>
        <div class="two">
          <label>City<input name="city" autocomplete="address-level2" required /><span class="field-err"></span></label>
          <label>Postal code<input name="zip" autocomplete="postal-code" inputmode="numeric" required /><span class="field-err"></span></label>
        </div>
        <div class="summary">
          <div><span>Items (${t.count})</span><span>${money(t.subtotal)}</span></div>
          <div><span>Delivery</span><span>${t.shipping === 0 ? "Free" : money(t.shipping)}</span></div>
          <div class="total"><span>Total</span><span>${money(t.total)}</span></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Place order · ${money(t.total)}</button>
      </form>`;
    openOverlay("#checkoutModal");
  }

  function validateForm(form) {
    let ok = true;
    $$("input", form).forEach((input) => {
      const val = input.value.trim();
      let msg = "";
      if (!val) msg = "This field is required";
      else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) msg = "Enter a valid email";
      else if (input.name === "zip" && !/^[0-9A-Za-z -]{3,10}$/.test(val)) msg = "Enter a valid postal code";
      input.classList.toggle("invalid", !!msg);
      const err = input.parentElement.querySelector(".field-err");
      if (err) err.textContent = msg;
      if (msg && ok) input.focus();
      if (msg) ok = false;
    });
    return ok;
  }

  function placeOrder(form) {
    if (!validateForm(form)) return;
    const orderNo = "MO-" + Math.floor(100000 + Math.random() * 900000);
    const field = (n) => form.querySelector(`[name="${n}"]`).value.trim();
    const name = field("name").split(" ")[0];
    state.cart = [];
    persist();
    renderCart();
    updateBadges(false);
    $("#checkoutBody").innerHTML = `
      <div class="success">
        <div class="check">✓</div>
        <h2 id="checkoutTitle">Thank you, ${escapeHtml(name)}.</h2>
        <p>Your order <strong>${orderNo}</strong> is confirmed. A receipt is on its way to ${escapeHtml(field("email"))}.</p>
        <button class="btn btn-ghost" data-close-checkout>Back to shopping</button>
      </div>`;
  }

  /* ---------- Search ---------- */
  function setupSearch() {
    const bar = $("#searchBar");
    const input = $("#searchInput");
    $("#searchToggle").addEventListener("click", () => {
      const open = bar.classList.toggle("open");
      if (open) setTimeout(() => input.focus(), 350);
      else { input.value = ""; state.filters.search = ""; renderGrid(); }
    });
    input.addEventListener("input", () => {
      state.filters.search = input.value;
      renderGrid();
      if (input.value.trim()) document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { input.value = ""; state.filters.search = ""; renderGrid(); }
    });
  }

  /* ---------- Wiring ---------- */
  function wire() {
    // Catalog interactions (event delegation)
    $("#productGrid").addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) return addToCart(add.dataset.add, 1);
      const wish = e.target.closest("[data-wish]");
      if (wish) return toggleWish(wish.dataset.wish);
      const open = e.target.closest("[data-open]");
      if (open) return openProduct(open.dataset.open);
    });
    $("#productGrid").addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".media[data-open]")) {
        e.preventDefault();
        openProduct(e.target.dataset.open);
      }
    });

    // Category navigation: header, tiles, footer, chips
    document.addEventListener("click", (e) => {
      const catEl = e.target.closest("[data-category]");
      if (catEl && !catEl.closest(".product-grid")) {
        const cat = catEl.dataset.category;
        if (catEl.closest("#mainNav")) $("#mainNav").classList.remove("open");
        closeAllOverlays();
        setCategory(cat);
        // Let the scroll happen after the overlay closes and the menu collapses
        if (catEl.tagName === "A" && catEl.getAttribute("href") === "#shop") return;
        document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
      }
    });

    $("#filterChips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) setCategory(chip.dataset.filter);
    });

    // Sorting & filters
    $("#sortSelect").addEventListener("change", (e) => { state.filters.sort = e.target.value; renderGrid(); });
    $("#inStockOnly").addEventListener("change", (e) => { state.filters.inStock = e.target.checked; renderGrid(); });
    $("#priceRange").addEventListener("input", (e) => {
      state.filters.maxPrice = +e.target.value;
      $("#priceValue").textContent = money(+e.target.value);
      renderGrid();
    });
    $("#resetFilters").addEventListener("click", () => {
      state.filters = { category: "All", search: "", maxPrice: 5000, sort: "featured", inStock: false };
      $("#sortSelect").value = "featured";
      $("#inStockOnly").checked = false;
      $("#priceRange").value = 5000;
      $("#priceValue").textContent = money(5000);
      $("#searchInput").value = "";
      renderGrid();
    });

    // Product modal
    $("#modalBody").addEventListener("click", (e) => {
      if (e.target.closest("#qtyPlus")) { modalQty = Math.min(10, modalQty + 1); $("#qtyVal").textContent = modalQty; }
      else if (e.target.closest("#qtyMinus")) { modalQty = Math.max(1, modalQty - 1); $("#qtyVal").textContent = modalQty; }
      else if (e.target.closest("#modalAdd")) { addToCart(modalProduct.id, modalQty); closeOverlay("#productModal"); }
      else if (e.target.closest("#modalWish")) toggleWish(modalProduct.id);
    });

    // Cart & wishlist drawers
    $("#cartBtn").addEventListener("click", () => { renderCart(); openOverlay("#cartDrawer"); });
    $("#wishlistBtn").addEventListener("click", () => { renderWishlist(); openOverlay("#wishDrawer"); });

    $("#cartItems").addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("[data-inc]")) { const id = t.closest("[data-inc]").dataset.inc; setQty(id, state.cart.find((l) => l.id === id).qty + 1); }
      else if (t.closest("[data-dec]")) { const id = t.closest("[data-dec]").dataset.dec; setQty(id, state.cart.find((l) => l.id === id).qty - 1); }
      else if (t.closest("[data-remove]")) removeFromCart(t.closest("[data-remove]").dataset.remove);
      else if (t.closest("[data-close-cart]")) closeOverlay("#cartDrawer");
    });

    $("#wishItems").addEventListener("click", (e) => {
      const move = e.target.closest("[data-move-cart]");
      const unwish = e.target.closest("[data-unwish]");
      if (move) {
        const id = move.dataset.moveCart;
        addToCart(id, 1);
        state.wishlist = state.wishlist.filter((x) => x !== id);
        persist(); renderWishlist(); updateWishBadge(); renderGrid();
      } else if (unwish) {
        toggleWish(unwish.dataset.unwish);
        renderWishlist();
      }
    });

    $("#checkoutBtn").addEventListener("click", openCheckout);

    // Checkout form
    $("#checkoutBody").addEventListener("submit", (e) => {
      if (e.target.id === "checkoutForm") { e.preventDefault(); placeOrder(e.target); }
    });
    $("#checkoutBody").addEventListener("click", (e) => {
      if (e.target.closest("[data-close-checkout]")) closeOverlay("#checkoutModal");
    });
    $("#checkoutModal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close-checkout]") || e.target.closest(".modal-close")) closeOverlay("#checkoutModal");
    });

    // Close handlers (backdrops and close buttons)
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.matches("#productModal [data-close]") || t.closest("#productModal .modal-close") || t.matches("#productModal .modal-backdrop")) closeOverlay("#productModal");
      if (t.matches("[data-close-cart]") || t.matches("[data-close-cart] *") || t.closest("#cartDrawer .icon-btn[data-close-cart]") || t.matches("#cartDrawer .modal-backdrop")) closeOverlay("#cartDrawer");
      if (t.matches("[data-close-wish]") || t.closest("[data-close-wish]") || t.matches("#wishDrawer .modal-backdrop")) closeOverlay("#wishDrawer");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllOverlays();
    });

    // Newsletter
    $("#newsletterForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#newsletterEmail").value.trim();
      const msg = $("#newsletterMsg");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = "Please enter a valid email address.";
        msg.className = "form-msg error";
        return;
      }
      msg.textContent = "Thanks — you're on the list.";
      msg.className = "form-msg ok";
      $("#newsletterEmail").value = "";
    });

    // Mobile menu
    const menuBtn = $("#menuToggle");
    menuBtn.addEventListener("click", () => {
      const open = $("#mainNav").classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    $$(".main-nav a").forEach((a) => a.addEventListener("click", () => {
      $("#mainNav").classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }));

    // Header shadow on scroll
    const header = $("#siteHeader");
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Reveal on scroll ---------- */
  function setupReveal() {
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("visible")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Init ---------- */
  function init() {
    renderGrid();
    renderCart();
    renderWishlist();
    updateBadges(false);
    setupSearch();
    wire();
    setupReveal();
  }

  // Replace image-less cards' broken images with the styled fallback
  document.addEventListener("error", (e) => {
    if (e.target.tagName === "IMG" && e.target.closest(".media")) {
      e.target.closest(".media").classList.add("no-img");
    }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
