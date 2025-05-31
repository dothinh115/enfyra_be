import { CreateTableDto } from '../table/dto/create-table.dto';
import { TableHanlderService } from '../table/table.service';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

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
  find() {
    return this.tableService.find();
  }
}
