import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { FileAssetsService } from '../services/file-assets.service';
import { Public } from '../../../shared/decorators/public-route.decorator';

interface RequestWithRouteData extends Request {
  routeData?: {
    params?: { [key: string]: string };
    [key: string]: any;
  };
}

@Controller('assets')
export class AssetsController {
  constructor(private readonly fileAssetsService: FileAssetsService) {}

  @Public()
  @Get(':id')
  async getAsset(
    @Req() req: RequestWithRouteData,
    @Res() res: Response,
  ): Promise<void> {
    const fileId = req.routeData?.params?.id || req.params.id;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    await this.fileAssetsService.streamFile(fileId, res);
  }
}
