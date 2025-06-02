import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({type:'varchar', nullable: false, unique: true})
  email: string;

  @Column({type:'varchar', nullable: false})
  password: string;

  @Column({type:'boolean', nullable: false, default: false})
  isRootUser: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}