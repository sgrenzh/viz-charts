import assert from 'node:assert/strict';

const driver = process.env.CHART_WEBDRIVER_URL ?? 'http://127.0.0.1:4444';
const gallery = process.env.CHART_TEST_URL ?? 'http://127.0.0.1:5173/';

async function command(path, method = 'GET', body) {
  const response = await fetch(driver + path, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { value } = await response.json();
  if (!response.ok) throw new Error(value.message);
  return value;
}

async function checks(reduced) {
  const { mountChart, chartLayout } = await import('/src/charts.ts');
  const { presets } = await import('/site/presets.ts');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches !== reduced) throw Error('Motion preference did not apply');
  const results = [];
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const preview = document.querySelector('#preview');
  const closePreview = document.querySelector('#preview-close');
  const nextFrame = () => new Promise(requestAnimationFrame);
  const finishPreviewMotion = async () => {
    const animations = preview.getAnimations({ subtree: true })
      .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime));
    await Promise.allSettled(animations.map(animation => animation.finished));
    await nextFrame();
  };

  for (const { config, formatHeadline } of presets) {
    const host = document.createElement('div');
    host.style.width = '400px';
    document.body.append(host);
    const demoState = config.title === 'Loading state' ? 'loading' : config.title === 'Error state' ? 'error' : undefined;
    const chart = mountChart(host, config, { demoState, formatHeadline });
    try {
      const card = host.firstElementChild;
      const plot = card.querySelector('.viz-plot');
      const svg = plot?.querySelector('svg');
      const tooltip = card.querySelector('.viz-tooltip');
      const title = () => tooltip.hidden ? null : tooltip.querySelector('strong')?.textContent;
      const key = key => plot.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      const pointer = (node, type, pointerType, x, y) => {
        const box = svg.getBoundingClientRect();
        node.dispatchEvent(new PointerEvent(type, {
          bubbles: true, isPrimary: true, pointerType, clientX: box.left + x, clientY: box.top + y,
        }));
      };

      if (demoState) {
        if (demoState === 'error') {
          card.querySelector('button').click();
          check(card.dataset.state === 'loading' && card.querySelector('.viz-loading-label').textContent === 'Loading...', 'Retry did not show loading immediately');
          check(card.querySelector('[role=status].viz-sr-only').textContent === 'Loading chart', 'Retry announcement missing');
        } else {
          check(getComputedStyle(card, '::after').animationName === (reduced ? 'none' : 'viz-shimmer'), 'Unexpected skeleton motion');
          chart.setLoadingStyle('spinner');
        }
        const spinner = card.querySelector('.viz-loading-spinner');
        check(getComputedStyle(spinner.parentElement).display === 'flex', 'Spinner indicator hidden');
        check(getComputedStyle(spinner).animationName === (reduced ? 'none' : 'viz-spin'), 'Unexpected spinner motion');
        check(getComputedStyle(card.querySelector('.viz-loading-label')).animationName === 'none', 'Loading label animates');
      } else {
        let current = config;
        const timeSeries = 'labels' in config || config.type === 'heatmap';
        if (timeSeries) {
          const last = 'labels' in config ? { ...config, labels: config.labels.slice(-3) } : { ...config, days: config.days.slice(-3) };
          if ('series' in last) last.series = last.series.map(series => ({ ...series, values: series.values.slice(-3) }));
          if ('ranges' in last) last.ranges = last.ranges.slice(-3);
          chart.update({ ...config, height: 320 }, { timeHorizon: true });
          chart.update(last, { timeHorizon: true });
          current = last;
        }
        const layout = chartLayout(current, plot.clientWidth);
        const [first, second] = layout.marks;
        check(svg.getAttribute('viewBox') === '0 0 ' + layout.width + ' ' + layout.height, 'Final plot dimensions are wrong');
        if (timeSeries) {
          for (const { tag, attrs } of layout.shapes) {
            const key = Object.hasOwn(attrs, 'data-bar-index') ? 'data-bar-index'
              : Object.hasOwn(attrs, 'data-heat-index') ? 'data-heat-index' : null;
            const nodes = key ? svg.querySelectorAll(tag + '[' + key + '="' + attrs[key] + '"]')
              : tag === 'path' && attrs.fill === 'none' ? svg.querySelectorAll('path[fill="none"]') : [];
            if (!key && !nodes.length) continue;
            const geometry = tag === 'path' ? ['d'] : ['x', 'y', 'width', 'height'];
            check([...nodes].some(node => geometry.every(name => node.getAttribute(name) === String(attrs[name]))),
              'Rendered mark geometry does not match the latest range');
          }
        }
        check(chart.getData().some(row => row.label === first.label && row.value === first.values[0][1]), 'Final data does not match layout');
        key('Home');
        check(title() === first.label, 'First keyboard tooltip is wrong');
        key('ArrowRight');
        check(title() === second.label, 'Next keyboard tooltip is wrong');
        check(tooltip.querySelector('.viz-tooltip-value').textContent === second.values[0][1], 'Tooltip value is wrong');
        check(getComputedStyle(tooltip).transitionDuration === '0s', 'Tooltip moves with a transition');
        if (current.type === 'line' || current.type === 'line-column') {
          check(card.querySelector('.viz-headline').textContent === (formatHeadline ? formatHeadline(current.series[0].values[1]) : second.values[0][1]), 'Headline did not update synchronously');
          check(Number(svg.querySelector('.viz-line-markers circle').getAttribute('cx')) === second.x, 'Marker does not track the point');
          chart.update({ ...current, marker: false, xAxis: { show: false } });
          key('Escape');
          const point = chartLayout({ ...current, marker: false, xAxis: { show: false } }, plot.clientWidth).marks[0];
          pointer(svg, 'pointermove', 'mouse', point.x, point.y);
          const guide = svg.querySelector('.viz-line-markers line');
          check(Number(guide?.getAttribute('x1')) === point.x && guide.getAttribute('stroke-dasharray') === '4 4', 'Hover guide missing or misaligned');
          check(!svg.querySelector('.viz-line-markers circle'), 'Marker dots should be hidden');
          pointer(svg, 'pointerleave', 'mouse', point.x, point.y);
          check(!svg.querySelector('.viz-line-markers line'), 'Hover guide survived pointer leave');
        }
        if (current.type === 'strip' || current.type === 'donut') {
          const rows = [...card.querySelectorAll('.viz-legend button')];
          const rowSizes = () => rows.map(row => row.getBoundingClientRect().height).join(',');
          const initialSizes = rowSizes();
          key('Enter');
          if (!current.segmented) check(rows[1].getAttribute('aria-pressed') === 'true', 'Keyboard selection missing');
          const attr = current.type === 'donut' ? 'data-donut-index' : 'data-strip-index';
          const hit = svg.querySelector('[' + attr + '="0"]');
          const x = current.segmented ? Number(hit.getAttribute('x')) + Number(hit.getAttribute('width')) / 2 : first.x;
          pointer(hit, 'pointermove', 'mouse', x, first.y);
          check(title() === first.label, 'Hover tooltip does not match the mark');
          if (current.type === 'strip') {
            pointer(hit, 'pointerup', 'touch', x, first.y);
            check(title() === first.label, 'Touch tooltip does not match the mark');
            pointer(hit, 'pointerup', 'touch', x, first.y);
            check(title() === null, 'Second tap did not dismiss tooltip');
          } else {
            check(rows[0].getAttribute('aria-pressed') === 'true', 'Pointer selection did not update legend');
            check(svg.querySelector('[data-donut-segment-index="0"]').dataset.selected === 'true', 'Pointer selection did not update ring');
            check(card.querySelector('.viz-donut-center').textContent === first.values[1][1], 'Centre value did not match selection');
            check(rowSizes() === initialSizes, 'Donut legend shifted on selection');
          }
        }
        check(card.getAnimations({ subtree: true }).length === 0, 'Unexpected chart animation');
        const frame = () => [svg.innerHTML, tooltip.getAttribute('style'), tooltip.textContent,
          card.querySelector('.viz-headline')?.textContent, tooltip.hidden].join('|');
        const settled = frame();
        for (let i = 0; i < 2; i++) {
          await new Promise(requestAnimationFrame);
          check(frame() === settled && card.getAnimations({ subtree: true }).length === 0,
            'Geometry, value or tooltip changed after the interaction frame');
        }
      }
    } catch (error) {
      throw Error(config.title + ': ' + error.message);
    } finally {
      chart.destroy();
      host.remove();
    }
    try {
      const trigger = [...document.querySelectorAll('.tile-settings')].find(button =>
        button.getAttribute('aria-label') === 'Chart settings for ' + config.title);
      check(trigger, 'Gallery settings button is missing');
      trigger.scrollIntoView({ block: 'center' });
      await nextFrame();
      trigger.click();
      const titleNode = document.querySelector(demoState ? '#preview-heading' : '#preview-chart h2');
      check(preview.open && titleNode?.textContent === config.title,
        'Gallery opened the wrong preview');
      const stage = document.querySelector('#preview-stage');
      check(stage.getAnimations().length === (reduced ? 0 : 1), 'Unexpected preview opening animation');
      await finishPreviewMotion();
      check(getComputedStyle(stage).transform === 'none', 'Preview stage did not settle');

      const range = [...preview.querySelectorAll('#preview-chart .chart-toolbar button[aria-expanded], #preview-range button[aria-expanded]')]
        .find(button => button.getClientRects().length);
      if (range && range.getClientRects().length) {
        range.click();
        const menu = document.getElementById(range.getAttribute('aria-controls'));
        const alternate = menu.querySelector('[role=menuitemradio][aria-checked=false]');
        if (alternate) {
          const label = alternate.textContent;
          alternate.click();
          check(range.textContent.trim() === label.trim(), 'Date range control did not commit the selection');
          check(!document.querySelector('#preview-chart svg')?.getAnimations({ subtree: true }).length,
            'Date range change animates the SVG');
        } else range.click();
      }

      closePreview.click();
      await finishPreviewMotion();
      check(!preview.open, 'Preview did not close');
      trigger.click();
      closePreview.click();
      await finishPreviewMotion();
      check(!preview.open, 'Preview did not close when opening motion was interrupted');
    } catch (error) {
      throw Error(config.title + ' gallery: ' + error.message);
    }
    results.push(config.title);
  }
  return results;
}

for (const reduced of [false, true]) {
  const { sessionId } = await command('/session', 'POST', {
    capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': {
      args: ['-headless'], prefs: { 'ui.prefersReducedMotion': Number(reduced) },
    } } },
  });
  const session = '/session/' + sessionId;
  try {
    await command(session + '/url', 'POST', { url: gallery });
    const result = await command(session + '/execute/async', 'POST', {
      script: `const done = arguments[arguments.length - 1]; (${checks.toString()})(arguments[0]).then(result => done({ result }), error => done({ error: error.message }));`,
      args: [reduced],
    });
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.result.length, 14);
    for (const name of result.result) console.log(`SUCCESS ${reduced ? 'reduced' : 'default'} | ${name}`);
  } finally {
    await command(session, 'DELETE');
  }
}
