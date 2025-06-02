import { TableDefinition } from '../entities/table.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class RelationDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => TableDefinition, { onDelete: 'CASCADE' })
  @JoinColumn()
  sourceTable: TableDefinition;

  @ManyToOne(() => TableDefinition, { onDelete: 'CASCADE' })
  @JoinColumn()
  targetTable: TableDefinition;

  @Column({
    type: 'enum',
    enum: ['one-to-one', 'many-to-one', 'one-to-many', 'many-to-many'],
  })
  type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

  @Column({ nullable: false })
  propertyName: string;

  @Column({ default: null })
  inversePropertyName: string | null;

  @Column({ default: false })
  isEager: boolean;

  @Column({ default: true })
  isNullable: boolean;
}
