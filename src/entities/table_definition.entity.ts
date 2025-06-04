import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Column_definition } from "./column_definition.entity";
import { Relation_definition } from "./relation_definition.entity";

@Entity("table_definition")
export class Table_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "boolean", nullable: false, default: false })
  isStatic: boolean;

  @Column({ type: "varchar", nullable: false, unique: true })
  name: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @OneToMany(() => Column_definition, rel => rel.table,{ cascade: true, eager: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  columns: Column_definition[];

  @OneToMany(() => Relation_definition, rel => rel.sourceTable,{ cascade: true, eager: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  relations: Relation_definition[];
}