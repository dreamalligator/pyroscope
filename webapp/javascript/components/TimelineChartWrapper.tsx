/* eslint-disable react/no-access-state-in-setstate */
/* eslint-disable react/no-did-update-set-state */
/* eslint-disable react/destructuring-assignment */
import React, { ReactNode } from 'react';
import { Timeline } from '@webapp/models/timeline';
import Color from 'color';
import { formatAsOBject } from '@webapp/util/formatDate';
import TimelineChart from './TimelineChart';
import styles from './TimelineChartWrapper.module.css';

interface TimelineData {
  data?: Timeline;
  color?: string;
}

interface Marking {
  from: string;
  to: string;
  color: Color;
  overlayColor?: string | Color;
}

type TimelineChartWrapperProps = {
  /** the id attribute of the element float will use to apply to, it should be unique */
  id: string;

  ['data-testid']?: string;
  onSelect: (from: string, until: string) => void;
  format: 'lines' | 'bars';

  /** timelineA refers to the first (and maybe unique) timeline */
  timelineA: TimelineData;
  /** timelineB refers to the second timeline, useful for comparison view */
  timelineB?: TimelineData;
  height?: string;

  /** refers to the highlighted selection */
  markings?: {
    left?: Marking;
    right?: Marking;
  };

  timezone: 'browser' | 'utc';
  title?: ReactNode;

  /** selection type 'single' => gray selection, 'double' => color selection */
  selectionType: 'single' | 'double';
};

class TimelineChartWrapper extends React.Component<
  TimelineChartWrapperProps,
  // TODO add type
  ShamefulAny
> {
  // eslint-disable-next-line react/static-property-placement
  static defaultProps = {
    format: 'bars',
  };

  constructor(props: TimelineChartWrapperProps) {
    super(props);

    let flotOptions = {
      margin: {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
      },
      selection: {
        mode: 'x',
        // custom selection works for 'single' selection type,
        // 'double' selection works in old fashion way
        // we use different props to customize selection appearance
        selectionType: props.selectionType,
        overlayColor:
          props.selectionType === 'double'
            ? undefined
            : props?.markings?.['right']?.overlayColor ||
              props?.markings?.['left']?.overlayColor,
        boundaryColor:
          props.selectionType === 'double'
            ? undefined
            : props?.markings?.['right']?.color ||
              props?.markings?.['left']?.color,
      },
      crosshair: {
        mode: 'x',
        color: '#C3170D',
        lineWidth: '1',
      },
      grid: {
        borderWidth: 1, // outside border of the timelines
        hoverable: true,
      },
      yaxis: {
        show: false,
        min: 0,
      },
      points: {
        show: false,
      },
      lines: {
        show: false,
      },
      bars: {
        show: true,
      },
      xaxis: {
        mode: 'time',
        timezone: 'browser',
        reserveSpace: false,
      },
    };

    flotOptions = (() => {
      switch (props.format) {
        case 'lines': {
          return {
            ...flotOptions,
            lines: {
              show: true,
            },
            bars: {
              show: false,
            },
          };
        }

        case 'bars': {
          return {
            ...flotOptions,
            bars: {
              show: true,
            },
            lines: {
              show: false,
            },
          };
        }
        default: {
          throw new Error(`Invalid format: '${props.format}'`);
        }
      }
    })();

    this.state = { flotOptions };
    this.state.flotOptions.grid.markings = this.plotMarkings();
  }

  componentDidUpdate(prevProps: TimelineChartWrapperProps) {
    if (prevProps.markings !== this.props.markings) {
      const newFlotOptions = this.state.flotOptions;
      newFlotOptions.grid.markings = this.plotMarkings();
      this.setState({ flotOptions: newFlotOptions });
    }
  }

  plotMarkings = () => {
    const constructMarking = (m: Marking) => {
      const from = new Date(formatAsOBject(m.from)).getTime();
      const to = new Date(formatAsOBject(m.to)).getTime();

      // 'double' selection uses built-in Flot selection
      // built-in Flot selection for 'single' case becomes 'transparent'
      // to use custom apperance and color for it
      const boundary = {
        lineWidth: 1,
        color:
          this.props.selectionType === 'double' ? m.color.rgb() : 'transparent',
      };

      return [
        {
          xaxis: { from, to },
          color:
            this.props.selectionType === 'double'
              ? m.overlayColor
              : 'tranparent',
        },
        { ...boundary, xaxis: { from, to: from } },
        { ...boundary, xaxis: { from: to, to } },
      ];
    };

    const { markings } = this.props;

    if (markings) {
      return [
        markings.left && constructMarking(markings.left),
        markings.right && constructMarking(markings.right),
      ]
        .flat()
        .filter((a) => !!a);
    }

    return [];
  };

  render = () => {
    const { flotOptions } = this.state;
    const { id, timelineA, timezone, title } = this.props;
    // TODO deep copy
    let timelineB = this.props.timelineB
      ? JSON.parse(JSON.stringify(this.props.timelineB))
      : undefined;

    const customFlotOptions = {
      ...flotOptions,
      xaxis: {
        ...flotOptions.xaxis,
        // In case there are few chunks left, then we'd like to add some margins to
        // both sides making it look more centers
        autoscaleMargin:
          timelineA.data && timelineA.data.samples.length > 3 ? null : 0.005,
        timezone: timezone || 'browser',
      },
    };

    // Since this may be overwritten, we always need to set it up correctly
    if (timelineA && timelineB) {
      customFlotOptions.bars.show = false;
    } else {
      customFlotOptions.bars.show = true;
    }

    // If they are the same, skew the second one slightly so that they are both visible
    if (areTimelinesTheSame(timelineA, timelineB)) {
      // the factor is completely arbitrary, we use a positive number to skew above
      timelineB = skewTimeline(timelineB, 4);
    }

    if (isSingleDatapoint(timelineA, timelineB)) {
      // check if both have a single value
      // if so, let's use bars
      // since we can't put a point when there's no data when using points
      if (timelineB && timelineB.data && timelineB.data.samples.length <= 1) {
        customFlotOptions.bars.show = true;

        // Also slightly skew to show them side by side
        timelineB.data.startTime += 0.01;
      }
    }

    const data = [
      timelineA &&
        timelineA.data && {
          ...timelineA,
          data: centerTimelineData(timelineA),
        },
      timelineB &&
        timelineB.data && { ...timelineB, data: centerTimelineData(timelineB) },
    ].filter((a) => !!a);

    return (
      <>
        {title}
        <TimelineChart
          onSelect={this.props.onSelect}
          className={styles.wrapper}
          // eslint-disable-next-line react/destructuring-assignment
          data-testid={this.props['data-testid']}
          id={id}
          options={customFlotOptions}
          data={data}
          //        data={d}
          width="100%"
          height={this.props.height || '100px'}
        />
      </>
    );
  };
}

function isSingleDatapoint(timelineA: TimelineData, timelineB?: TimelineData) {
  const aIsSingle = timelineA.data && timelineA.data.samples.length <= 1;
  if (!aIsSingle) {
    return false;
  }

  if (timelineB && timelineB.data) {
    return timelineB.data.samples.length <= 1;
  }

  return true;
}

function skewTimeline(
  timeline: TimelineData | undefined,
  factor: number
): TimelineData | undefined {
  if (!timeline) {
    return undefined;
  }

  // TODO: deep copy
  const copy = JSON.parse(JSON.stringify(timeline)) as typeof timeline;

  if (copy && copy.data) {
    let min = copy.data.samples[0];
    let max = copy.data.samples[0];

    for (let i = 0; i < copy.data.samples.length; i += 1) {
      const b = copy.data.samples[i];

      if (b < min) {
        min = b;
      }
      if (b > max) {
        max = b;
      }
    }

    const height = 100; // px
    const skew = (max - min) / height;

    if (copy.data) {
      copy.data.samples = copy.data.samples.map((a) => {
        // We don't want to skew negative values, since users are expecting an absent value
        if (a <= 0) {
          return 0;
        }

        // 4 is completely arbitrary, it was eyeballed
        return a + skew * factor;
      });
    }
  }

  return copy;
}

function areTimelinesTheSame(
  timelineA: TimelineData,
  timelineB?: TimelineData
) {
  if (!timelineA || !timelineB) {
    // for all purposes let's consider two empty timelines the same
    // since we want to transform them
    return false;
  }
  const dataA = timelineA.data;
  const dataB = timelineB.data;

  if (!dataA || !dataB) {
    return false;
  }

  // Find the biggest one
  const biggest = dataA.samples.length > dataB.samples.length ? dataA : dataB;
  const smallest = dataA.samples.length < dataB.samples.length ? dataA : dataB;

  const map = new Map(biggest.samples.map((a) => [a, true]));

  return smallest.samples.every((a) => map.has(a));
}

// Since profiling data is chuked by 10 seconds slices
// it's more user friendly to point a `center` of a data chunk
// as a bar rather than starting point, so we add 5 seconds to each chunk to 'center' it
function centerTimelineData(timelineData: TimelineData) {
  return timelineData.data
    ? decodeTimelineData(timelineData.data).map((x) => [
        x[0] + 5000,
        x[1] === 0 ? 0 : x[1] - 1,
      ])
    : [[]];
}

function decodeTimelineData(timeline: Timeline) {
  if (!timeline) {
    return [];
  }
  let time = timeline.startTime;
  return timeline.samples.map((x) => {
    const res = [time * 1000, x];
    time += timeline.durationDelta;
    return res;
  });
}

export default TimelineChartWrapper;
