import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity("route")
export class Route {
  @Column({type:'boolean', nullable: false, default: true})
  isPublished: boolean;

  @Column({type:'text', nullable: false, default: null})
  handler: string;

  @Column({type:'varchar', nullable: false, default: null})
  path: string;

  @Column({type:'varchar', nullable: false, default: "GET"})
  method: string;

  @PrimaryGeneratedColumn('increment')
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}