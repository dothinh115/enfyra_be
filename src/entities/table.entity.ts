import { ColumnDefinition } from '../entities/column.entity';
import { RelationDefinition } from '../entities/relation.entity';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TableDefinition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ nullable: false, unique: true })
  name: string;

  @OneToMany(() => ColumnDefinition, (column) => column.table, {
    cascade: true,
    eager: true,
  })
  columns: ColumnDefinition[];

  @OneToMany(() => RelationDefinition, (rel) => rel.sourceTable, {
    cascade: true,
    eager: true,
  })
  relations: RelationDefinition[];
}
