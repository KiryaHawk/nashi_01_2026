let currentFromQuantity = 0;
let currentToQuantity = Infinity;
let showGibdd = true;

ymaps.ready(init);

function init() {
  fetch('nashi.json')
    .then(response => response.json())
    .then(obj => {
      console.log('raw data:', obj);

      // ✅ поиск справа (как было)
      const searchControls = new ymaps.control.SearchControl({
        options: {
          float: 'right',
          noPlacemark: true
        }
      });

      const myMap = new ymaps.Map('map', {
        center: [55.76, 37.64],
        zoom: 7,
        controls: [searchControls]
      });

      const removeControls = [
        'geolocationControl',
        'trafficControl',
        'fullscreenControl',
        'zoomControl',
        'rulerControl',
        'typeSelector'
      ];
      removeControls.forEach(ctrl => myMap.controls.remove(ctrl));

      const objectManager = new ymaps.ObjectManager({
        clusterize: true,
        clusterIconLayout: 'default#pieChart'
      });

      let minLatitude = Infinity, maxLatitude = -Infinity;
      let minLongitude = Infinity, maxLongitude = -Infinity;

      let minQuantity = Infinity;
      let maxQuantity = -Infinity;

      const validFeatures = [];

      obj.features.forEach(feature => {
        if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;

        const [longitude, latitude] = feature.geometry.coordinates;
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        // Яндекс ждёт [lat, lon]
        feature.geometry.coordinates = [lat, lon];

        minLatitude = Math.min(minLatitude, lat);
        maxLatitude = Math.max(maxLatitude, lat);
        minLongitude = Math.min(minLongitude, lon);
        maxLongitude = Math.max(maxLongitude, lon);

        const preset = feature.options && feature.options.preset;
        const isBlue = preset === 'islands#blueIcon';

        const q = extractQuantity(feature);

        if (!isBlue) {
          if (q === null) return;

          if (!feature.properties) feature.properties = {};
          feature.properties.quantity = q;

          if (q < minQuantity) minQuantity = q;
          if (q > maxQuantity) maxQuantity = q;
        }

        validFeatures.push(feature);
      });

      if (validFeatures.length === 0) {
        console.warn('Нет точек для отображения.');
        return;
      }

      if (minQuantity === Infinity || maxQuantity === -Infinity) {
        minQuantity = 0;
        maxQuantity = 0;
      }

      console.log('quantity min =', minQuantity, 'max =', maxQuantity);

      obj.features = validFeatures;

      objectManager.removeAll();
      objectManager.add(obj);
      myMap.geoObjects.add(objectManager);

      if (
        minLatitude !== Infinity && maxLatitude !== -Infinity &&
        minLongitude !== Infinity && maxLongitude !== -Infinity
      ) {
        const bounds = [
          [minLatitude, minLongitude],
          [maxLatitude, maxLongitude]
        ];
        myMap.setBounds(bounds, { checkZoomRange: true });
      }

      setupFilterUI(minQuantity, maxQuantity, objectManager);
    })
    .catch(err => {
      console.error('Ошибка загрузки anna.json:', err);
    });
}

function extractQuantity(feature) {
  if (!feature.properties) return null;

  if (
    feature.properties.quantity !== undefined &&
    feature.properties.quantity !== null &&
    feature.properties.quantity !== ''
  ) {
    const qNum = Number(feature.properties.quantity);
    if (Number.isFinite(qNum)) return qNum;
  }

  const body = feature.properties.balloonContentBody;
  if (typeof body === 'string') {
    const re = /Кол-во\s+ДК\s+за\s+месяц:\s*<span[^>]*>([\d\s]+)/i;
    const match = body.match(re);
    if (match && match[1]) {
      const numStr = match[1].replace(/\s+/g, '');
      const q = parseInt(numStr, 10);
      if (!isNaN(q)) return q;
    }
  }

  return null;
}

function setupFilterUI(minQuantity, maxQuantity, objectManager) {
  const toggleBtn = document.getElementById('filter-toggle');
  const gibddToggle = document.getElementById('gibdd-toggle');
  const panel = document.getElementById('filter-panel');

  const fromRange = document.getElementById('quantity-from-range');
  const toRange = document.getElementById('quantity-to-range');
  const fromInput = document.getElementById('quantity-from-input');
  const toInput = document.getElementById('quantity-to-input');

  const currentValueLabel = document.getElementById('filter-current-value');
  const warning = document.getElementById('filter-warning');

  if (!toggleBtn || !gibddToggle || !panel ||
      !fromRange || !toRange || !fromInput || !toInput ||
      !currentValueLabel || !warning) {
    console.warn('Элементы фильтра не найдены в DOM.');
    return;
  }

  panel.style.display = 'none';

  const rangeMin = minQuantity;
  const rangeMax = (minQuantity === maxQuantity) ? (maxQuantity + 1) : maxQuantity;

  [fromRange, toRange].forEach(el => {
    el.min = rangeMin;
    el.max = rangeMax;
    el.step = 1;
  });

  [fromInput, toInput].forEach(el => {
    el.min = rangeMin;
    el.max = rangeMax;
    el.step = 1;
  });

  currentFromQuantity = rangeMin;
  currentToQuantity = rangeMax;

  fromRange.value = currentFromQuantity;
  toRange.value = currentToQuantity;
  fromInput.value = currentFromQuantity;
  toInput.value = currentToQuantity;

  updateLabel(currentFromQuantity, currentToQuantity);
  setWarning(false);

  toggleBtn.addEventListener('click', () => {
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
  });

  showGibdd = true;
  gibddToggle.classList.add('active');

  gibddToggle.addEventListener('click', () => {
    showGibdd = !showGibdd;
    gibddToggle.classList.toggle('active', showGibdd);
    applyFilter(currentFromQuantity, currentToQuantity, objectManager);
  });

  function setWarning(isBad) {
    warning.style.display = isBad ? 'block' : 'none';
  }

  function clampHard(v) {
    if (!Number.isFinite(v)) v = rangeMin;
    if (v < rangeMin) v = rangeMin;
    if (v > rangeMax) v = rangeMax;
    return v;
  }

  // во время ввода НЕ режем значение, чтобы можно было набрать "500" (5 -> 50 -> 500)
  function readSoftInt(v) {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    if (!/^\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function syncSlidersSoft(fromVal, toVal) {
    if (fromVal !== null) fromRange.value = clampHard(fromVal);
    if (toVal !== null) toRange.value = clampHard(toVal);
  }

  function tryApply(fromVal, toVal, mode) {
    // mode: 'typing' | 'commit'
    const isValid = (fromVal !== null && toVal !== null && fromVal <= toVal);

    setWarning(!isValid);

    // во время набора — НЕ исправляем поля, просто не применяем фильтр
    if (mode === 'typing') {
      if (isValid) {
        currentFromQuantity = clampHard(fromVal);
        currentToQuantity = clampHard(toVal);

        fromRange.value = currentFromQuantity;
        toRange.value = currentToQuantity;

        updateLabel(currentFromQuantity, currentToQuantity);
        applyFilter(currentFromQuantity, currentToQuantity, objectManager);
      }
      return;
    }

    // commit: доводим до валидного и применяем
    let f = (fromVal === null) ? currentFromQuantity : clampHard(fromVal);
    let t = (toVal === null) ? currentToQuantity : clampHard(toVal);
    if (t < f) t = f;

    currentFromQuantity = f;
    currentToQuantity = t;

    fromInput.value = f;
    toInput.value = t;
    fromRange.value = f;
    toRange.value = t;

    setWarning(false);
    updateLabel(f, t);
    applyFilter(f, t, objectManager);
  }

  // --- Ползунки: значения готовы, применяем сразу (и поднимаем "до", если нужно)
  fromRange.addEventListener('input', () => {
    const f = clampHard(parseInt(fromRange.value, 10));
    const t = clampHard(parseInt(toRange.value, 10));
    const tt = Math.max(f, t);

    fromInput.value = f;
    toInput.value = tt;

    tryApply(f, tt, 'typing');
  });

  toRange.addEventListener('input', () => {
    const f = clampHard(parseInt(fromRange.value, 10));
    const t = clampHard(parseInt(toRange.value, 10));
    const tt = Math.max(f, t);

    fromInput.value = f;
    toInput.value = tt;

    tryApply(f, tt, 'typing');
  });

  // --- Инпуты: позволяем вводить любые цифры, даже если временно "до < от"
  fromInput.addEventListener('input', () => {
    const f = readSoftInt(fromInput.value);
    const t = readSoftInt(toInput.value);
    syncSlidersSoft(f, t);
    tryApply(f, t, 'typing');
  });

  toInput.addEventListener('input', () => {
    const f = readSoftInt(fromInput.value);
    const t = readSoftInt(toInput.value);
    syncSlidersSoft(f, t);
    tryApply(f, t, 'typing');
  });

  // commit на blur/change/Enter
  function commit() {
    const f = readSoftInt(fromInput.value);
    const t = readSoftInt(toInput.value);
    tryApply(f, t, 'commit');
  }

  fromInput.addEventListener('change', commit);
  toInput.addEventListener('change', commit);
  fromInput.addEventListener('blur', commit);
  toInput.addEventListener('blur', commit);

  [fromInput, toInput].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        inp.blur();
      }
    });
  });

  function updateLabel(fromVal, toVal) {
    currentValueLabel.textContent = `Показываются точки с кол-вом от ${fromVal} до ${toVal}`;
  }

  applyFilter(currentFromQuantity, currentToQuantity, objectManager);
}

function applyFilter(fromQty, toQty, objectManager) {
  currentFromQuantity = fromQty;
  currentToQuantity = toQty;

  if (!objectManager) return;

  objectManager.setFilter(obj => {
    const preset = obj.options && obj.options.preset;
    const isBlue = preset === 'islands#blueIcon';

    // Синие точки (ГИБДД)
    if (isBlue) return showGibdd;

    const q = extractQuantity(obj);
    if (q === null) return false;

    return q >= currentFromQuantity && q <= currentToQuantity;
  });
}
