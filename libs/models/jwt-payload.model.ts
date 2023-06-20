interface JwtPayload {
  email: string;
  _id: string;
  iat: number;
  exp: number;
}

export {JwtPayload};
