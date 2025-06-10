import { User_definition } from '../../entities/user_definition.entity';

export type TDynamicContext = {
  $repos: any;
  $body: any;
  $query: any;
  $params: any;
  $user: User_definition | undefined;
  $logs: (...args: any[]) => void;
  $helpers: any;
  $errors: {
    throw400: (msg: string) => never;
    throw401: () => never;
  };
};
