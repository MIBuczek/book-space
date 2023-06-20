import bcrypt from 'bcrypt';
import validator from 'validator';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';

export type TUser = HydratedDocument<User>;

@Schema()
export class User {
  @Prop({
    type: String,
    required: [true, 'Please enter a your first name'],
    minlength: [3, 'Minimum password length is 3 characters']
  })
  firstName: string;

  @Prop({
    type: String,
    required: [true, 'Please enter a your last name'],
    minlength: [3, 'Minimum password length is 3 characters']
  })
  lastName: string;

  @Prop({
    type: String,
    required: [true, 'Please enter a password'],
    minlength: [6, 'Minimum password length is 6 characters']
  })
  password: string;

  @Prop({
    type: String,
    required: [true, 'Please enter an email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email: string;

  @Prop({
    type: Date,
    immutable: true,
    default: () => new Date()
  })
  createdAt: Date;

  @Prop({
    type: Date,
    default: () => new Date()
  })
  lastLogin: Date;
}

const userSchema = SchemaFactory.createForClass(User);

/* Pre save middle action to hash user password */
userSchema.pre('save', async function (next) {
  const salt = await bcrypt.genSalt();
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export const UserSchema = userSchema;
