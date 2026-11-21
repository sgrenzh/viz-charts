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

export async function checks(reduced, narrow) {
  const { mountChart, chartLayout } = await import('/src/charts.ts');
  const { presets } = await import('/site/presets.ts');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches !== reduced) throw Error('Motion preference did not apply');
  const results = [];
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const preview = document.querySelector('#preview');
  const closePreview = document.querySelector('#preview-close');
  const nextFrame = () => new Promise(requestAnimationFrame);
  const finishMotion = async root => {
    const animations = root.getAnimations({ subtree: true })
      .filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime));
    await Promise.allSettled(animations.map(animation => animation.finished));
    await nextFrame();
  };

  const verifyRangeMenu = (trigger, menu) => {
    const selected = menu.querySelector('[aria-checked=true]');
    const buttonBox = trigger.getBoundingClientRect();
    const rowBox = selected.getBoundingClientRect();
    for (const edge of ['left', 'top', 'width', 'height']) {
      check(Math.abs(buttonBox[edge] - rowBox[edge]) <= 0.001, 'Selected date-range row differs from trigger: ' + edge);
    }
    check(getComputedStyle(trigger).transform === 'none', 'Date-range trigger moves');
    check(!menu.getAnimations().length, 'Keyboard-opened date range menu animates');
  };
  const hasRange = config => 'labels' in config ? config.labels.length > 0 : config.type === 'heatmap';
  const durationFor = config => reduced ? 100 : ({
    line: 220, 'line-column': 240, heatmap: 160, 'range-column': 190,
    column: config.stacked ? 200 : 180,
  })[config.type];
  const verifyMotion = (plot, config) => {
    const transfer = plot.querySelector('.viz-horizon-clip');
    check(transfer?.getAttribute('aria-hidden') === 'true', 'Range transition layer missing or exposed to AT');
    const animations = plot.getAnimations({ subtree: true });
    check(animations.length && animations.every(animation => animation.effect.getTiming().duration <= durationFor(config)), 'Range timing is missing or over budget');
    check(animations.some(animation => animation.effect.getTiming().duration === durationFor(config)), 'Range transition duration is wrong');
    if (reduced) check(animations.every(animation => animation.effect.getKeyframes().every(frame => !frame.transform)), 'Reduced motion contains movement');
    check(new Set([...plot.querySelectorAll('[id]')].map(node => node.id)).size === plot.querySelectorAll('[id]').length, 'Duplicate plot resource IDs');
  };

  for (const { config, formatHeadline } of presets) {
    const host = document.createElement('div');
    host.style.width = narrow ? '320px' : '800px';
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
        const timeSeries = hasRange(config);
        check(!plot.querySelector('.viz-horizon-clip'), 'First paint has range animation');
        if (timeSeries) {
          const last = 'labels' in config ? { ...config, labels: config.labels.slice(-3) } : { ...config, days: config.days.slice(-21) };
          if ('series' in last) last.series = last.series.map(series => ({ ...series, values: series.values.slice(-3) }));
          if ('ranges' in last) last.ranges = last.ranges.slice(-3);
          if (config.headline) last.headline = '1,234';
          chart.update(last, { timeHorizon: true });
          verifyMotion(plot, config);
          if (config.headline) check(!!card.querySelector('.viz-horizon-digit') === !reduced, 'Headline digit roll is missing or ignored reduced motion');
          if (!reduced && (config.type === 'line' || config.type === 'line-column')) {
            const trace = svg.querySelector('[data-horizon-trace=shared]');
            check(trace, 'Shared timestamps did not create a moving trace');
            const traceClip = document.getElementById(trace.getAttribute('clip-path')?.slice(5, -1));
            check(traceClip?.localName === 'clipPath', 'Moving trace is not clipped to its plot');
            const start = trace.getAttribute('d');
            await nextFrame();
            await nextFrame();
            check(trace.isConnected && trace.getAttribute('d') !== start, 'Line froze during the transition');
            if (config.type === 'line-column') {
              const firstX = Number(/^M([^,]+),/.exec(trace.getAttribute('d'))?.[1]);
              const bar = svg.querySelector('[data-bar-index="0"]');
              const box = bar.getBoundingClientRect();
              const barX = box.left + box.width / 2 - svg.getBoundingClientRect().left;
              check(Math.abs(firstX - barX) < 3, 'Price and volume use different frame positions');
            }
          }
          chart.update(config, { timeHorizon: true });
          verifyMotion(plot, config);
          check(plot.querySelectorAll('.viz-horizon-clip').length === 1 &&
            plot.querySelector('.viz-horizon-outgoing') &&
            svg.getAnimations({ subtree: true }).some(animation => animation.effect.getKeyframes()[0].opacity === '0'),
            'Rapid reversal discarded the visible frame');
          await finishMotion(card);
          check(!plot.querySelector('.viz-horizon-clip'), 'Finished transition left an outgoing layer');

          chart.update(last, { timeHorizon: true });
          verifyMotion(plot, config);
          host.style.width = narrow ? '344px' : '748px';
          await nextFrame();
          await nextFrame();
          check(!plot.querySelector('.viz-horizon-clip'), 'Resize left stale motion over the plot');

          chart.update(config, { timeHorizon: true });
          verifyMotion(plot, config);
          const size = plot.scrollWidth;
          const firstMark = chartLayout(config, plot.clientWidth).marks[0];
          pointer(svg, 'pointermove', 'mouse', firstMark.x, firstMark.y);
          check(!plot.querySelector('.viz-horizon-clip') && title() === firstMark.label, 'Hover during motion did not settle on the newest data');
          check(plot.scrollWidth === size, 'Outgoing plot changed the scrollable extent');

          chart.update(last, { timeHorizon: true });
          verifyMotion(plot, config);
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
        check(!plot.querySelector('.viz-horizon-clip'), 'Keyboard inspection did not settle the plot');
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
      const homePlot = trigger.closest('.gallery-tile').querySelector('.viz-plot');
      const homeRange = trigger.closest('.gallery-tile').querySelector('.chart-toolbar button[aria-expanded]');
      if (hasRange(config)) {
        check(homeRange && homePlot, 'Gallery range control missing');
        homeRange.click();
        const menu = document.getElementById(homeRange.getAttribute('aria-controls'));
        verifyRangeMenu(homeRange, menu);
        const previous = menu.querySelector('[aria-checked=true]').textContent;
        const alternate = menu.querySelector('[aria-checked=false]');
        check(alternate, 'Gallery has no alternate range');
        alternate.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        verifyMotion(homePlot, config);
        await finishMotion(homePlot);
        homeRange.click();
        const restored = [...menu.querySelectorAll('[role=menuitemradio]')].find(option => option.textContent.trim() === previous.trim());
        restored.click();
        check(!homePlot.querySelector('.viz-horizon-clip'), 'Gallery keyboard range selection animated');
      }
      trigger.click();
      const titleNode = document.querySelector(demoState ? '#preview-heading' : '#preview-chart h2');
      check(preview.open && titleNode?.textContent === config.title,
        'Gallery opened the wrong preview');
      const stage = document.querySelector('#preview-stage');
      check(stage.getAnimations().length === (reduced ? 0 : 1), 'Unexpected preview opening animation');
      await finishMotion(preview);
      check(getComputedStyle(stage).transform === 'none', 'Preview stage did not settle');

      const range = [...preview.querySelectorAll('#preview-chart .chart-toolbar button[aria-expanded], #preview-range button[aria-expanded]')]
        .find(button => button.getClientRects().length);
      if (range && range.getClientRects().length) {
        range.click();
        const menu = document.getElementById(range.getAttribute('aria-controls'));
        if (hasRange(config)) verifyRangeMenu(range, menu);
        const alternate = menu.querySelector('[role=menuitemradio][aria-checked=false]');
        if (alternate) {
          const label = alternate.textContent;
          const previous = menu.querySelector('[aria-checked=true]').textContent;
          alternate.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          check(range.textContent.trim() === label.trim(), 'Date range control did not commit the selection');
          if (hasRange(config)) {
            const detailPlot = preview.querySelector('#preview-chart .viz-plot');
            verifyMotion(detailPlot, config);
            range.click();
            const selected = [...menu.querySelectorAll('[role=menuitemradio]')].find(option => option.textContent.trim() === previous.trim());
            selected.click(); // Keyboard activation generates click detail 0.
            check(!detailPlot.querySelector('.viz-horizon-clip'), 'Keyboard range selection animated');
          }
        } else range.click();
      }

      closePreview.click();
      await finishMotion(preview);
      check(!preview.open, 'Preview did not close');
      trigger.click();
      closePreview.click();
      await finishMotion(preview);
      check(!preview.open, 'Preview did not close when opening motion was interrupted');
    } catch (error) {
      throw Error(config.title + ' gallery: ' + error.message);
    }
    results.push(config.title);
  }
  return results;
}

if (import.meta.main) for (const [reduced, narrow] of [[false, false], [false, true], [true, false], [true, true]]) {
  const { sessionId } = await command('/session', 'POST', {
    capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': {
      args: ['-headless'], prefs: { 'ui.prefersReducedMotion': Number(reduced) },
    } } },
  });
  const session = '/session/' + sessionId;
  try {
    await command(session + '/timeouts', 'POST', { script: 90000 });
    await command(session + '/window/rect', 'POST', { width: narrow ? 450 : 1280, height: 900 });
    await command(session + '/url', 'POST', { url: gallery });
    const result = await command(session + '/execute/async', 'POST', {
      script: `const done = arguments[arguments.length - 1]; (${checks.toString()})(arguments[0], arguments[1]).then(result => done({ result }), error => done({ error: error.message }));`,
      args: [reduced, narrow],
    });
    assert.equal(result.error, undefined, result.error);
    assert.equal(result.result.length, 14);
    for (const name of result.result) console.log(`SUCCESS ${reduced ? 'reduced' : 'default'} ${narrow ? 'narrow' : 'wide'} | ${name}`);
  } finally {
    await command(session, 'DELETE');
  }
}
