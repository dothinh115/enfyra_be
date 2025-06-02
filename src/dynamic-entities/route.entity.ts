import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TableDefinition } from './../entities/table.entity';
@Entity("route")
export class Route {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false, default: "GET"})
  method: string;

  @Column({type:'varchar', nullable: false, default: null})
  path: string;

  @Column({type:'text', nullable: false, default: null})
  handler: string;

  @Column({type:'boolean', nullable: false, default: true})
  isPublished: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
  @ManyToOne(() => TableDefinition, { nullable: false, eager: true, cascade: true })
  @JoinColumn()
  targetTable: TableDefinition;
}