import bcrypt from 'bcrypt';
import validator from 'validator';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';
import {USER_ROLES, TUserRole} from '@models/user.model';

export type TUser = HydratedDocument<User>;

@Schema()
export class User {
  @Prop({
    type: String,
    required: [true, 'Please enter a your first name'],
    minlength: [3, 'Minimum password length is 3 characters']
  })
  firstName!: string;

  @Prop({
    type: String,
    required: [true, 'Please enter a your last name'],
    minlength: [3, 'Minimum password length is 3 characters']
  })
  lastName!: string;

  @Prop({
    type: String,
    required: [true, 'Please enter a password'],
    minlength: [6, 'Minimum password length is 6 characters']
  })
  password!: string;

  @Prop({
    type: String,
    required: [true, 'Please enter an email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email!: string;

  // Required, with no default: defaulting to ADMIN would make every user created
  // without an explicit role an administrator, and defaulting to EMPLOYEE would
  // silently grant the least-privileged role to a caller who meant something else.
  // A required field makes the omission a validation error.
  @Prop({
    type: String,
    enum: {values: [...USER_ROLES], message: 'Role must be one of ADMIN, OFFICE, EMPLOYEE'},
    required: [true, 'Please assign a role']
  })
  role!: TUserRole;

  // Conditionally required: an administrator is not tied to a facility, so the
  // requirement is enforced in the DTO where the role is known, not here.
  @Prop({type: String})
  city?: string;

  @Prop({type: [String], default: undefined})
  buildings?: string[];

  @Prop({type: Boolean, default: true})
  active!: boolean;

  @Prop({
    type: Date,
    immutable: true,
    default: () => new Date()
  })
  createdAt!: Date;

  @Prop({
    type: Date,
    default: () => new Date()
  })
  lastLogin!: Date;
}

const userSchema = SchemaFactory.createForClass(User);

/* Pre save middle action to hash user password */
userSchema.pre('save', async function () {
  // Hashing unconditionally would re-hash an already-hashed password on every later
  // save, leaving a stored value that no longer matches what the user typed.
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt();
  this.password = await bcrypt.hash(this.password, salt);
});

export const UserSchema = userSchema;
