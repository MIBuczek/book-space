type TClientType = 'INDIVIDUAL' | 'COMPANY';

type TPayment = 'CASH' | 'TRANSFER' | 'CARD';

interface IPlace {
  place: string;
  city: string;
}

export {TClientType, TPayment, IPlace};
