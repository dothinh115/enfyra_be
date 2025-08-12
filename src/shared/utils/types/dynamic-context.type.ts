import { Request } from 'express';

export type TDynamicContext = {
  $repos: any;
  $body: any;
  $query: any;
  $params: any;
  $user: any;
  $logs: (...args: any[]) => void;
  $helpers: {
    [key: string]: any;
  };
  $req: Request & {
    [key: string]: any;
  };
  $errors: {};
  $result?: any;
  $data?: any;
  $statusCode?: number;
  $share?: {
    $data?: any;
    [key: string]: any;
  };
};

export type TGqlDynamicContext = {
  $repos: any;
  $args: any;
  $user: any;
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
  $result?: any;
  $data?: any;
  $share?: {
    $data?: any;
    [key: string]: any;
  };
};
