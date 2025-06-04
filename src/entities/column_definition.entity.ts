import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";

@Entity("column_definition")
export class Column_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false})
  name: string;

  @Column({type:'varchar', nullable: false})
  type: string;

  @Column({type:'boolean', nullable: false, default: false})
  isGenerated: boolean;

  @Column({type:'boolean', nullable: false, default: false})
  isPrimary: boolean;

  @Column({type:'boolean', nullable: false, default: true})
  isNullable: boolean;

  @Column({type:'boolean', nullable: false, default: false})
  isStatic: boolean;

  @Column({type:'simple-json', nullable: true})
  default: any;

  @Column({type:'simple-json', nullable: true})
  enumValues: any;

  @Column({type:'boolean', nullable: true, default: false})
  isUnique: boolean;


  @ManyToOne(() => Table_definition, rel => rel.columns , { onDelete: 'NO ACTION', onUpdate: 'NO ACTION', nullable: true } )
  @JoinColumn()
  table: Table_definition;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}