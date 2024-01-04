const MOVE_ITERATIONS = 20;
const MOVE_DELAY = 50;

function createContentfulBlock(): void {
  const intViewportHeight = document.documentElement.clientHeight;
  const intViewportWidth = document.documentElement.clientWidth;

  const p = document.createElement('p');
  p.textContent = 'a contentful block';
  p.style.height = `${intViewportHeight / 20}px`;
  p.style.width = `${intViewportWidth}px`;
  p.style.overflow = 'hidden';
  p.style.position = 'absolute';
  p.style.backgroundColor = '#aaa';
  document.getElementById('content')?.appendChild(p);
}

function addPercent(percent: number, prop: string): string {
  const n = Number(prop.replace('px', ''));
  const pixels = (document.documentElement.clientHeight * percent) / 100;
  return `${n + pixels}px`;
}

async function moveBy(elem: HTMLParagraphElement, percent: number): Promise<void> {
  if (elem.getAttribute('id') === 'partial') {
    const max = Number(elem.getAttribute('max-steps'));
    let current = Number(elem.getAttribute('steps'));
    current++;
    if (current > max) {
      return;
    }
    elem.setAttribute('steps', `${current}`);
  }

  return new Promise(resolve => {
    setTimeout(() => {
      elem.style.top = addPercent(percent, elem.style.top);
      resolve();
    }, MOVE_DELAY);
  });
}

async function moveAll(elems: HTMLParagraphElement[], times: number): Promise<void> {
  for (let i = 0; i < times; i++)
    for (const el of elems) {
      await moveBy(el, 5);
    }
}

function howMany(desiredCls: number): { extraSteps: number; createParagraphs: number } {
  const fullRuns = Math.floor(desiredCls / 0.095);
  const extraSteps = Math.round((desiredCls - fullRuns * 0.095) / 0.005);
  let create = fullRuns;
  if (extraSteps > 0) {
    create++;
  }

  return { extraSteps: extraSteps, createParagraphs: create };
}

export async function simulateCLS(desiredCLS: number): Promise<void> {
  const { extraSteps, createParagraphs } = howMany(desiredCLS);

  for (let i = 0; i < createParagraphs; i++) {
    createContentfulBlock();
  }

  const elems = Array.from(document.getElementsByTagName('p'));
  elems[0]?.setAttribute('id', 'partial');
  elems[0]?.setAttribute('max-steps', `${extraSteps}`);
  elems[0]?.setAttribute('steps', '0');

  return moveAll(elems, MOVE_ITERATIONS);
}
