import { Table_definition } from './entities/table_definition.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('relation_definition')
export class RelationDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

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

  @Column({ default: false, update: false })
  isStatic: boolean;

  @ManyToOne(() => Table_definition, { onDelete: 'CASCADE' })
  @JoinColumn()
  sourceTable: Table_definition;

  @ManyToOne(() => Table_definition, { onDelete: 'CASCADE' })
  @JoinColumn()
  targetTable: Table_definition;
}
