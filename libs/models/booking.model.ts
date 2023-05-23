type TClient = 'INDIVIDUAL' | 'COMPANY'

type TPayment = 'CASH' | 'TRANSFER' | 'CARD'

interface IPlace {
  place : string;
  city : string
}

export {TClient, TPayment,IPlace}
