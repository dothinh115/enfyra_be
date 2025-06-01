import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity("route")
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
}