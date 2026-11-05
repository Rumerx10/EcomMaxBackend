import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Every route needs a signed-in user unless it is marked @Public(). A valid token on a public
// route still identifies the caller, so @GetUser() works there when someone is signed in.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
