import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { TableDefinition } from './../entities/table.entity';
@Entity("route")
@Unique(["method", "path", ])
export class Route {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false, default: "GET"})
  method: string;

  @Column({type:'varchar', nullable: false})
  path: string;

  @Column({type:'text', nullable: false})
  handler: string;

  @Column({type:'boolean', nullable: false, default: true})
  isPublished: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
  @ManyToOne(() => TableDefinition, { eager: true, cascade: true })
  @JoinColumn()
  targetTable: TableDefinition;
}