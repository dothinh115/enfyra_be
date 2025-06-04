import { CreateTableDto } from '../table/dto/create-table.dto';
import { TableHanlderService } from '../table/table.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TQuery } from '../utils/type';

@Controller('table-handler')
export class TableController {
  constructor(private readonly tableService: TableHanlderService) {}

  @Post()
  createTable(@Body() body: CreateTableDto) {
    return this.tableService.createTable(body);
  }

  @Patch(':id')
  updateTable(@Body() body: CreateTableDto, @Param('id') id: string) {
    return this.tableService.updateTable(+id, body);
  }

  @Get()
  find(@Query() query: TQuery) {
    return this.tableService.find(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query() query: TQuery) {
    return this.tableService.findOne(+id, query);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.tableService.delete(+id);
  }
}
