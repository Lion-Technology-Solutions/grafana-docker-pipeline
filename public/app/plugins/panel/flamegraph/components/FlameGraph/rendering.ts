import { colors } from '@grafana/ui';

import {
  BAR_BORDER_WIDTH,
  BAR_TEXT_PADDING_LEFT,
  COLLAPSE_THRESHOLD,
  HIDE_THRESHOLD,
  LABEL_THRESHOLD,
  PIXELS_PER_LEVEL,
} from '../../constants';
import { TextAlign } from '../types';

import { FlameGraphDataContainer, LevelItem } from './dataTransform';

type RectData = {
  width: number;
  height: number;
  x: number;
  y: number;
  collapsed: boolean;
  ticks: number;
  label: string;
  unitLabel: string;
  itemIndex: number;
};

/**
 * Compute the pixel coordinates for each bar in a level. We need full level of bars so that we can collapse small bars
 * into bigger rects.
 */
export function getRectDimensionsForLevel(
  data: FlameGraphDataContainer,
  level: LevelItem[],
  levelIndex: number,
  totalTicks: number,
  rangeMin: number,
  pixelsPerTick: number
): RectData[] {
  const coordinatesLevel = [];
  for (let barIndex = 0; barIndex < level.length; barIndex += 1) {
    const item = level[barIndex];
    const barX = getBarX(item.start, totalTicks, rangeMin, pixelsPerTick);
    let curBarTicks = data.getValue(item.itemIndex);

    // merge very small blocks into big "collapsed" ones for performance
    const collapsed = curBarTicks * pixelsPerTick <= COLLAPSE_THRESHOLD;
    if (collapsed) {
      while (
        barIndex < level.length - 1 &&
        item.start + curBarTicks === level[barIndex + 1].start &&
        data.getValue(level[barIndex + 1].itemIndex) * pixelsPerTick <= COLLAPSE_THRESHOLD
      ) {
        barIndex += 1;
        curBarTicks += data.getValue(level[barIndex].itemIndex);
      }
    }

    const displayValue = data.getValueDisplay(item.itemIndex);
    let unit = displayValue.suffix ? displayValue.text + displayValue.suffix : displayValue.text;

    const width = curBarTicks * pixelsPerTick - (collapsed ? 0 : BAR_BORDER_WIDTH * 2);
    coordinatesLevel.push({
      width,
      height: PIXELS_PER_LEVEL,
      x: barX,
      y: levelIndex * PIXELS_PER_LEVEL,
      collapsed,
      ticks: curBarTicks,
      label: data.getLabel(item.itemIndex),
      unitLabel: unit,
      itemIndex: item.itemIndex,
    });
  }
  return coordinatesLevel;
}

export function renderRect(
  ctx: CanvasRenderingContext2D,
  rect: RectData,
  totalTicks: number,
  rangeMin: number,
  rangeMax: number,
  query: string,
  levelIndex: number,
  topLevelIndex: number,
  foundNames: Set<string>,
  textAlign: TextAlign
) {
  if (rect.width < HIDE_THRESHOLD) {
    return;
  }

  ctx.beginPath();
  ctx.rect(rect.x + (rect.collapsed ? 0 : BAR_BORDER_WIDTH), rect.y, rect.width, rect.height);

  //  / (rangeMax - rangeMin) here so when you click a bar it will adjust the top (clicked)bar to the most 'intense' color
  const intensity = Math.min(1, rect.ticks / totalTicks / (rangeMax - rangeMin));
  const h = 50 - 50 * intensity;
  const l = 65 + 7 * intensity;

  const name = rect.label;

  if (!rect.collapsed) {
    ctx.stroke();

    if (query) {
      ctx.fillStyle = foundNames.has(name) ? getBarColor(h, l) : colors[55];
    } else {
      ctx.fillStyle = levelIndex > topLevelIndex - 1 ? getBarColor(h, l) : getBarColor(h, l + 15);
    }
  } else {
    ctx.fillStyle = foundNames.has(name) ? getBarColor(h, l) : colors[55];
  }
  ctx.fill();

  if (!rect.collapsed && rect.width >= LABEL_THRESHOLD) {
    renderLabel(ctx, name, rect, textAlign);
  }
}

// Renders a text inside the node rectangle. It allows setting alignment of the text left or right which takes effect
// when text is too long to fit in the rectangle.
function renderLabel(ctx: CanvasRenderingContext2D, name: string, rect: RectData, textAlign: TextAlign) {
  ctx.save();
  ctx.clip(); // so text does not overflow
  ctx.fillStyle = '#222';

  // We only measure name here instead of full label because of how we deal with the units and aligning later.
  const measure = ctx.measureText(name);
  const spaceForTextInRect = rect.width - BAR_TEXT_PADDING_LEFT;

  let label = `${name} (${rect.unitLabel})`;
  let labelX = Math.max(rect.x, 0) + BAR_TEXT_PADDING_LEFT;

  // We use the desired alignment only if there is not enough space for the text, otherwise we keep left alignment as
  // that will already show full text.
  if (measure.width > spaceForTextInRect) {
    ctx.textAlign = textAlign;
    // If aligned to the right we don't want to take the space with the unit label as the assumption is user wants to
    // mainly see the name. This also reflects how pyro/flamegraph works.
    if (textAlign === 'right') {
      label = name;
      labelX = rect.x + rect.width - BAR_TEXT_PADDING_LEFT;
    }
  }

  ctx.fillText(label, labelX, rect.y + PIXELS_PER_LEVEL / 2);
  ctx.restore();
}

/**
 * Returns the X position of the bar. totalTicks * rangeMin is to adjust for any current zoom. So if we zoom to a
 * section of the graph we align and shift the X coordinates accordingly.
 * @param offset
 * @param totalTicks
 * @param rangeMin
 * @param pixelsPerTick
 */
export function getBarX(offset: number, totalTicks: number, rangeMin: number, pixelsPerTick: number) {
  return (offset - totalTicks * rangeMin) * pixelsPerTick;
}

function getBarColor(h: number, l: number) {
  return `hsl(${h}, 100%, ${l}%)`;
}
