import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BaseTableProcessor } from './base-table-processor';

@Injectable()
export class MenuDefinitionProcessor extends BaseTableProcessor {
  async transformRecords(records: any[], context: { repo: Repository<any> }): Promise<any[]> {
    const { repo } = context;
    
    // Separate mini sidebars and menu items
    const miniSidebars = records.filter((r) => r.type === 'mini');
    const menuItems = records.filter((r) => r.type === 'menu');

    // First process mini sidebars to get their IDs
    const sidebarNameToId = new Map();
    for (const sidebar of miniSidebars) {
      const existingSidebar = await repo.findOne({
        where: { type: sidebar.type, label: sidebar.label },
      });

      if (existingSidebar) {
        sidebarNameToId.set(sidebar.label, existingSidebar.id);
      } else {
        const created = repo.create(sidebar);
        const saved = await repo.save(created);
        sidebarNameToId.set(sidebar.label, saved.id);
      }
    }

    // Transform menu items with proper sidebar references
    const transformedMenuItems = menuItems.map((menuItem) => {
      const transformed = { ...menuItem };
      if (menuItem.sidebar && sidebarNameToId.has(menuItem.sidebar)) {
        transformed.sidebar = sidebarNameToId.get(menuItem.sidebar);
      }
      return transformed;
    });

    // Return all records (sidebars already processed, but include for completeness)
    return [...miniSidebars, ...transformedMenuItems];
  }

  getUniqueIdentifier(record: any): object[] {
    if (record.type === 'mini') {
      // For mini sidebars, check by type + label
      return [{ type: record.type, label: record.label }];
    } else if (record.type === 'menu') {
      // For menu items, try multiple strategies
      const conditions = [
        { type: record.type, label: record.label, sidebar: record.sidebar },
        { type: record.type, label: record.label }, // Fallback without sidebar
      ];
      return conditions;
    }
    
    // Fallback for other types
    return [{ type: record.type, label: record.label }];
  }

  // TODO: Uncomment when update logic is restored
  // protected getCompareFields(): string[] {
  //   return ['label', 'icon', 'path', 'isEnabled', 'description', 'order', 'permission'];
  // }
}