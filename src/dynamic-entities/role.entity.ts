import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity("role")
export class Role {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'varchar', nullable: false})
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}