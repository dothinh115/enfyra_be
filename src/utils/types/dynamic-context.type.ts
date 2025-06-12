import { Request } from 'express';
import { User_definition } from '../../entities/user_definition.entity';

export type TDynamicContext = {
  $repos: any;
  $body: any;
  $query: any;
  $params: any;
  $user: User_definition | undefined;
  $logs: (...args: any[]) => void;
  $helpers: {
    [key: string]: any;
  };
  $req: Request & {
    [key: string]: any;
  };
  $errors: {
    throw400: (msg: string) => never;
    throw401: () => never;
  };
};
