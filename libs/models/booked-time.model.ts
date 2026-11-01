const BOOKING_STATUSES = ['INITIAL', 'DONE', 'CANCELED'] as const;
type TSingleBookingStatus = (typeof BOOKING_STATUSES)[number];

interface IBookedTime {
  day: Date;
  startHours: Date;
  endHours: Date;
  status: TSingleBookingStatus;
  participants?: number;
  comments?: string;
}

export {BOOKING_STATUSES, TSingleBookingStatus, IBookedTime};
