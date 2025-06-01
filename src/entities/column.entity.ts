import { TableDefinition } from '../entities/table.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ColumnDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  type: string;

  @Column({ default: false })
  isGenerated: boolean;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: true })
  isNullable: boolean;

  @ManyToOne(() => TableDefinition, (table) => table.columns)
  table: TableDefinition;

  @Column({ nullable: true, type: 'simple-json' })
  default: string | number | boolean | null;
}
