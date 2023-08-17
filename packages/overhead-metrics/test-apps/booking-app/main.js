(function () {
  const searchForm = document.querySelector('#search');

  searchForm.addEventListener('submit', event => {
    event.preventDefault();

    updateOffers();
  });

  const obs = new MutationObserver(function (mutations) {
    console.log(mutations);
  });

  obs.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  });
})();

function updateOffers() {
  const list = document.querySelector('.result-list');

  // Clear out existing children
  for (let el of list.children) {
    list.removeChild(el);
  }

  // Add new children
  // Allow to define children count via URL ?count=100
  const url = new URL(window.location.href);
  const count = parseInt(url.searchParams.get('count') || 50);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.classList.add('result');
    el.innerHTML = generateResult();

    const id = crypto.randomUUID();
    el.setAttribute('id', id);

    addListeners(id, el);

    list.appendChild(el);
  }
}

function addListeners(id, el) {
  el.querySelector('[data-long-text-open]').addEventListener('click', event => {
    const parent = event.target.closest('.long-text');
    parent.setAttribute('data-show-long', '');
  });
  el.querySelector('[data-long-text-close]').addEventListener('click', event => {
    const parent = event.target.closest('.long-text');
    parent.removeAttribute('data-show-long');
  });

  // These are purposefully inefficient
  el.querySelector('[data-select]').addEventListener('click', () => {
    document.querySelectorAll('.result').forEach(result => {
      if (result.getAttribute('id') === id) {
        result.setAttribute('data-show-options', 'yes');
      } else {
        result.setAttribute('data-show-options', 'no');
      }
    });

    // Do some more, extra expensive work
    document.querySelectorAll('.select__price').forEach(el => {
      el.setAttribute('js-is-checked', new Date().toISOString());
      el.setAttribute('js-is-checked-2', new Date().toISOString());
      el.setAttribute('js-is-checked-3', 'yes');
      el.setAttribute('js-is-checked-4', 'yes');
      el.setAttribute('js-is-checked-5', 'yes');
      el.setAttribute('js-is-checked-6', 'yes');
    });
    document.querySelectorAll('.tag').forEach(el => el.setAttribute('js-is-checked', 'yes'));
    document.querySelectorAll('h3').forEach(el => el.setAttribute('js-is-checked', 'yes'));
  });
}

const baseTitles = ['Cottage house', 'Cabin', 'Villa', 'House', 'Appartment', 'Cosy appartment'];
const baseBeds = ['2', '2+2', '4+2', '6+2', '6+4'];
const baseDescription =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

function generateResult() {
  const title = `${getRandomItem(baseTitles)} ${Math.ceil(Math.random() * 20)}`;
  const beds = getRandomItem(baseBeds);
  const description = baseDescription
    .split(' ')
    .slice(Math.ceil(Math.random() * 10))
    .join(' ');
  const price = 200 + Math.random() * 800;

  // Make short version of description
  const descriptionShort = description.slice(0, 200);
  const priceStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  const placeholders = {
    title,
    beds,
    description,
    descriptionShort,
    priceStr,
  };

  return replacePlaceholders(template, placeholders);
}

function getRandomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function replacePlaceholders(str, placeholders) {
  let replacedStr = str;
  Object.keys(placeholders).forEach(placeholder => {
    replacedStr = replacedStr.replaceAll(`{{${placeholder}}}`, placeholders[placeholder]);
  });

  return replacedStr;
}

const template = `<figure class="result-image">
  <img alt="{{title}}" data-image />
</figure>

<div class="result-content">
  <div>
    <h3>{{title}}</h3>

    <div class="tags">
      <span class="tag">{{beds}}</span>
    </div>
  </div>

  <div class="long-text">
    <div class="long-text__short">
      {{descriptionShort}}<button type="button" data-long-text-open>... Read more</button>
    </div>

    <div class="long-text__long">
      {{description}}
      <button type="button" data-long-text-close>Read less</button>
    </div>
  </div>

  <div class="select">
    <button type="button" data-select>
      <div aria-hidden="true" class="icon">+</div>
      <div>Select</div>

      <div class="select__price">
        <div class="price__amount">{{priceStr}}</div>
        <div class="price__quantity-label">/night</div>
      </div>
    </button>
  </div>

  <div class="options">
    <div class="field">
      <select>
        <option value="0">0 rooms</option>
        <option value="1">1 room</option>
      </select>
    </div>

    <div class="field">
      <select>
        <option value="1">1 guest</option>
        <option value="2">2 guests</option>
      </select>
    </div>
  </div>
</div>`;
