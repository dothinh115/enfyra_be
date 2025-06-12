import { Injectable } from '@nestjs/common';

@Injectable()
export class SchemaStateService {
  private currentVersion: string;

  getVersion() {
    return this.currentVersion;
  }

  setVersion(newVer: string) {
    this.currentVersion = newVer;
  }
}
